# Backup and restore

## What a backup contains

`mernpress-backup-<UTC timestamp>.tar.gz` in `BACKUP_STORAGE_DIR`
(production `/opt/mernpress/backups`) contains:

```
database.sql    # pg_dump --clean --if-exists --no-owner --no-privileges
media.tar.gz    # the MEDIA_STORAGE_DIR tree
MANIFEST.txt    # format version, timestamp, database name
```

The archive does **not** contain `.env`, SMTP credentials, session cookies in
plaintext, or server code. It does contain password hashes, reset tokens (hashed),
application-password hashes and uploaded media: treat it as sensitive, keep the
`0600` permissions, and copy it to encrypted storage off the server.

## Create, list, download

- Admin: **Tools → Backups → Create backup**, then Download/Delete.
- API: `POST /api/admin/backups`, `GET /api/admin/backups`,
  `GET /api/admin/backups/<file>/download`.
- Retention: only the newest `BACKUP_RETENTION` (default 5) files are kept.

## Restore (command line only)

There is deliberately no restore button. Run this on the server as an operator:

```bash
# 0. Identify the archive and verify its contents
cd /opt/mernpress/backups
tar -tzf mernpress-backup-YYYYMMDDTHHMMSSZ.tar.gz

# 1. Stop the app so nothing writes during the restore
sudo systemctl stop mernpress-api mernpress-web

# 2. Extract to a scratch directory
rm -rf /tmp/mernpress-restore
mkdir -p /tmp/mernpress-restore
tar -xzf mernpress-backup-YYYYMMDDTHHMMSSZ.tar.gz -C /tmp/mernpress-restore

# 3. Restore the database (DATABASE_URL is in /etc/mernpress/mernpress.env)
set -a; . /etc/mernpress/mernpress.env; set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/mernpress-restore/database.sql

# 4. Restore media (keep a copy of the current tree first)
sudo mv /opt/mernpress/media /opt/mernpress/media.before-restore-$(date -u +%Y%m%dT%H%M%SZ)
sudo mkdir -p /opt/mernpress/media
sudo tar -xzf /tmp/mernpress-restore/media.tar.gz -C /opt/mernpress/media
sudo chown -R mernpress:mernpress /opt/mernpress/media

# 5. Start and verify
sudo systemctl start mernpress-api mernpress-web
curl -fsS https://mernpress.duckdns.org/api/health
curl -fsS -o /dev/null -w '%{http_code}\n' https://mernpress.duckdns.org/
curl -fsS -o /dev/null -w '%{http_code}\n' https://mernpress.duckdns.org/admin/
```

Notes:

- The SQL dump uses `--clean --if-exists`, so it drops and recreates the objects
  it contains. Restoring an old backup therefore **removes data created after
  that backup**.
- Use the release that matches the backup, or run
  `pnpm --filter @mernpress/database exec prisma migrate deploy` afterwards with
  the current release before starting the API.
- Keep `/opt/mernpress/media.before-restore-*` until the site is verified; delete
  it later.
- If the restore fails, stop the services, fix the error, and retry from step 2
  with the same archive.
