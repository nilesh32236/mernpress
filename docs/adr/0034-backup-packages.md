# ADR 0034 — Backup packages with retention

- Status: accepted (owner scope decision, 2026-11-05)
- Implements the backup slice from `docs/research/plugin-theme-roadmap.md`

## Context

Backups are one of the most requested "should be core" features, and users
complain that existing plugins hide failures, lack retention and charge
subscriptions. MERNPress had WXR export (content only) but no database/media
archive.

## Decision

1. **One self-describing archive.** A backup is
   `mernpress-backup-YYYYMMDDTHHMMSSZ.tar.gz` containing:
   - `database.sql` — `pg_dump --format=plain --clean --if-exists --no-owner
     --no-privileges`
   - `media.tar.gz` — the media storage directory
   - `MANIFEST.txt` — format version, timestamp, database name and restore
     documentation pointer
2. **Credentials never enter the archive or argv.** The database URL is parsed
   and the password is passed to `pg_dump` through `PGPASSWORD`; the manifest
   records only the database name. Files are created `0600`.
3. **Writable, persistent store.** `BACKUP_STORAGE_DIR` (production
   `/opt/mernpress/backups`, outside releases) is required in production.
   `BACKUP_RETENTION` keeps the newest N (default 5, max 50) and prunes older
   files.
4. **Administrators only, on every route.** Listing, creating, downloading and
   deleting all require `manage_options`; the download response is `no-store`
   with an attachment filename. Filenames are strictly validated; traversal is
   404/400, not a file read.
5. **No in-app restore.** Restoring a database/media archive from a web request
   is too destructive. The UI states this and links to
   `docs/operations/backup-restore.md`, a reviewed CLI procedure that stops the
   services, verifies the archive, restores SQL and media, and restarts.
6. **Failure containment and concurrency.** A second create while one runs
   returns 409. A failed dump/tar removes the partial archive, logs the error and
   returns `500 BACKUP_FAILED`; temporary directories are always removed.
7. **Honest scope.** The archive is a full database dump plus media; it is not
   encrypted, not uploaded off-server and not incremental. Operators must copy it
   somewhere private and protect it.

## Consequences

- No migration: backups are files on disk; metadata comes from the filename and
  stat, so deleting a file externally is reflected immediately.
- `pg_dump` and `tar` must exist on the host (verified: PostgreSQL 18 client
  tools and GNU tar are installed).
- Backups can be large and take time; the API route runs them synchronously with
  a 10-minute process timeout. A future slice can queue them.
- A backup contains password hashes, reset tokens and media; access is
  administrator-only and the files are `0600`.

## Amendment 2026-11-06 — queued execution (ADR 0054)

Backup creation now runs as a durable `backup.create` job instead of inside the
HTTP request:

- `POST /api/admin/backups` checks `hasActive('backup.create')`, enqueues a job
  with `maxAttempts: 2` and returns **202** with the job plus the current backup
  list. A second request while one is pending/running returns
  `409 BACKUP_IN_PROGRESS`.
- The worker calls `BackupService.createSystem()`; the capability check remains
  on the route, and the existing single-run guard still protects the service.
  A failed dump/tar records the error in the job and schedules one retry before
  `FAILED`.
- Tools → Backups polls `GET /api/admin/jobs/:id` every 2 s, shows queued/
  running/completed/failed status, attempts, scheduled or started time and the
  last error, links to Scheduled Actions, and refreshes the archive list when
  the job completes. An active job is rediscovered on page reload via the jobs
  list.
- The archive format, retention, download/delete route and CLI restore are
  unchanged. `BackupService.create(principal)` remains available for internal
  callers/tests; the HTTP route no longer uses it.

Consequences: a long backup survives an admin request timeout and API restart;
the request returns immediately; duplicate clicks are rejected while a job is
active. The worker process must be enabled (`SCHEDULER_ENABLED=true`) for the
job to run. The status is job-level (queued/running/completed), not a byte
percentage.
