# Jobs: durable background queue

The API runs trusted background handlers from a PostgreSQL-backed queue. The
decision record is [ADR 0054](../adr/0054-durable-background-jobs.md).

## Model

`jobs` (`20261106160000_add_jobs`):

| Column | Notes |
| --- | --- |
| `type` | Handler name, `^[a-z0-9][a-z0-9._-]{0,99}$` |
| `payload` | JSONB, max 32 KB, never secrets/tokens |
| `status` | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `priority` | Higher claims first (−100…100) |
| `attempts` / `max_attempts` | Claim increments attempts; default 3 |
| `scheduled_at` | Due time (timezone-aware) |
| `locked_at` / `locked_by` | Claim ownership; cleared on completion/retry |
| `started_at` / `completed_at` | Execution timeline |
| `last_error` | Truncated handler message (2,000 chars) |

Indexes: `(status, scheduled_at)`, `type`, `(status, locked_at)`.

## Claim and retry

```
UPDATE jobs SET status='RUNNING', locked_at=now(), locked_by=$worker,
                started_at=now(), attempts=attempts+1
WHERE id IN (
  SELECT id FROM jobs
  WHERE status='PENDING' AND scheduled_at <= now()
  ORDER BY priority DESC, scheduled_at, id
  LIMIT $n FOR UPDATE SKIP LOCKED
)
RETURNING id, type, payload, attempts, max_attempts
```

- Success → `COMPLETED`, `completed_at`, locks cleared.
- Failure with attempts left → `PENDING`, backoff `min(1h, 30s × 2^(attempts−1))`,
  `last_error` recorded.
- Failure at `max_attempts` → `FAILED`, `completed_at`, `last_error`.
- `recoverStuck(now − 10 min)` returns abandoned RUNNING rows to PENDING.
- Delivery is at-least-once; handlers must be idempotent.

## Worker

`apps/api/src/jobs/worker.ts` ticks every 15 s (3 s boot delay), recovers stale
rows, claims up to 10 jobs and dispatches by `type`. A claim/tick error is
logged and the timer continues. The worker runs only with
`SCHEDULER_ENABLED=true`; multiple API processes are safe because of SKIP
LOCKED.

## Current handlers

| Type | Cadence | Work |
| --- | --- | --- |
| `notes.retention` | Every 6 h + boot catch-up | `NoteService.purgeExpiredTrash` with `notes_trash_retention_days` |
| `analytics.retention` | Every 24 h + boot catch-up | `AnalyticsService.prune` with `analytics_retention_days` |
| `jobs.cleanup` | Every 24 h + boot catch-up | Delete COMPLETED/CANCELLED older than 7 days, FAILED older than 30 days |

The scheduler (`apps/api/src/scheduler.ts`) enqueues one active job per type;
`hasActive` prevents duplicate pending/running rows. Handler option reads happen
at execution time; a failed read throws and retries instead of guessing.

## Adding a job type

1. Add a stable name to `apps/api/src/jobs/types.ts`.
2. Implement `(payload) => Promise<void>` in `apps/api/src/jobs/handlers.ts` or a
   dedicated module; make it idempotent.
3. Register it in `createJobHandlers` and enqueue from the scheduler or a
   service through `JobQueueService.enqueue`.
4. Test success, failure/retry and the admin list/run/cancel path.

Do not add an HTTP endpoint that accepts an arbitrary job type — handlers are
trusted code and the admin API only exposes list/run/cancel.

## Admin

Tools → Scheduled Actions (`/tools/jobs`):

- filter by status and hook name;
- see attempts, scheduled time, status badge and last error;
- **Run now** reschedules with attempts reset; **Cancel** works for
  pending/failed rows.

API (administrator only): `GET /api/admin/jobs`,
`POST /api/admin/jobs/:id/run`, `POST /api/admin/jobs/:id/cancel`.

## Operations

- One worker per API process; `SCHEDULER_ENABLED=false` disables both the
  scheduler and the worker.
- Retention CLIs remain available for scheduler-less deployments:
  `analytics:prune` and the notes purge CLI.
- A long-running handler is not interrupted by a database timeout. Future
  long jobs (backups, media batches) should split work or add checkpoints.
- Errors are stored, not retried forever: inspect FAILED rows on the screen and
  use Run now after fixing the cause.
- No cron expressions, per-job timeouts or payload encryption yet.
