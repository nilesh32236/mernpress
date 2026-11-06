# ADR 0054 — Durable background job queue

- Status: accepted (2026-11-06)
- Related: [jobs architecture](../architecture/jobs.md), migration
  `20261106160000_add_jobs`
- Gap: Action Scheduler / WP-Cron (research §7)

## Context

Background work was in-process only:

- Scheduled-post publishing: a one-minute `setInterval`.
- Notes-trash retention: a six-hour timer.
- Analytics retention: a daily timer.

A process restart lost the pending window, a thrown sweep was only logged, and
there was no way to see or retry the work. The WordPress ecosystem fills this
with Action Scheduler (20k+ standalone installs, WooCommerce-scale) and WP
Crontrol (300k+), while core WP-Cron only fires on page loads. The project
already requires PostgreSQL and has a migration mechanism, so a durable table +
`FOR UPDATE SKIP LOCKED` worker is the smallest complete fix — no Redis, no new
service.

## Decision

1. **`jobs` table** (`20261106160000_add_jobs`): id, type, JSONB payload,
   status enum (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`),
   priority, attempts, maxAttempts, scheduledAt, lockedAt/lockedBy,
   startedAt/completedAt, lastError, timestamps. Indexes on
   `(status, scheduled_at)`, `type` and `(status, locked_at)`.

2. **One claim statement.** `claimDue` runs a single
   `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING …`,
   setting RUNNING, the worker id, start time and `attempts + 1`. Multiple API
   instances can share the table and never run the same row twice.

3. **Worker retries.** A handler failure schedules the job back to PENDING with
   exponential backoff (30 s, 60 s, … capped at 1 h) until `attempts >=
   maxAttempts`, then marks FAILED with a truncated message. A RUNNING row older
   than 10 minutes is returned to PENDING by `recoverStuck`, so a crashed worker
   does not strand work. Delivery is at-least-once; handlers must be idempotent.

4. **Retention sweeps move to jobs.** The scheduler now enqueues
   `notes.retention` (6 h) and `analytics.retention` (24 h) instead of running
   them inline, and `hasActive(type)` prevents duplicate pending/running rows.
   The boot catch-up and per-interval enqueue remain; the job row survives a
   restart. Handlers read the retention option at execution time; a failed
   option read throws and retries rather than pruning with a guessed window.
   A daily `jobs.cleanup` job deletes COMPLETED/CANCELLED rows older than 7
   days and FAILED rows older than 30 days, so the table stays bounded. The
   publish sweep stays a direct one-minute timer (its claim is already
   idempotent).

5. **Admin surface.** Tools → Scheduled Actions lists jobs (status/hook filter,
   attempts, scheduled time, last error) with **Run now** (reschedule, reset
   attempts) and **Cancel** (pending/failed only). API:
   `GET /api/admin/jobs`, `POST /api/admin/jobs/:id/run|:id/cancel`,
   administrator-only. There is deliberately no HTTP endpoint to enqueue an
   arbitrary job type: handlers are code-owned.

6. **Worker gating.** The worker starts only when `SCHEDULER_ENABLED=true`,
   alongside the existing schedulers. `SCHEDULER_ENABLED=false` (tests,
   unsynchronized multi-instance deployments) leaves rows untouched.

## Alternatives considered

- **BullMQ / pg-boss / Redis** — new runtime dependency and, for BullMQ, Redis;
  the claim/retry logic here is small and already tested.
- **External cron** — still needs a durable store and loses admin visibility.
- **Keep in-process timers and add a log** — does not survive restarts, cannot
  retry, and gives no operator control.
- **Recurring rows with cron expressions** — more model than the two retention
  sweeps need; the scheduler already owns the cadence and `hasActive` prevents
  duplicates.

## Consequences

- Jobs are at-least-once; every handler must tolerate a repeat (the retention
  sweeps are naturally idempotent).
- `payload` is capped at 32 KB and error messages at 2,000 characters. Never put
  credentials or session tokens in a payload — the row is readable by
  administrators through the API.
- A single worker per API process; multiple processes are safe because of SKIP
  LOCKED, but a job's runtime is not bounded by a DB timeout. Long handlers
  (future backups/media) should checkpoint or split work.
- No cron expressions, delays beyond `scheduledAt`, priorities beyond the
  integer column, or per-job timeouts yet.
- Retention behaviour is unchanged for operators; the difference is durability,
  retry visibility and the admin screen.
