import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { requireCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';

const execFileAsync = promisify(execFile);

/**
 * Backup packages (Tools → Backups).
 *
 * A backup is one `.tar.gz` containing:
 *   - `database.sql`   plain SQL dump (pg_dump --no-owner --no-privileges)
 *   - `media.tar.gz`   the media storage directory
 *   - `MANIFEST.txt`   timestamp, database name, format version
 *
 * Passwords are passed to pg_dump via PGPASSWORD, never argv. Restore is a
 * deliberate command-line procedure, not an in-app button: overwriting a live
 * database from a web request would be too dangerous.
 */
export interface BackupFile {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupListResult {
  backups: BackupFile[];
  retention: number;
}

export interface BackupServiceOptions {
  mediaRoot: string;
  backupDir: string;
  databaseUrl: string;
  /** Number of newest backups kept. */
  retention?: number;
  pgDumpPath?: string;
  tarPath?: string;
  now?: () => Date;
  logger?: (message: string, meta?: Record<string, unknown>) => void;
}

const BACKUP_NAME = /^mernpress-backup-\d{8}T\d{6}Z\.tar\.gz$/;
const FORMAT_VERSION = 1;

function parseDatabaseUrl(value: string): {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
} {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ContentError('VALIDATION_ERROR', 'DATABASE_URL is not a valid URL', 500);
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new ContentError('VALIDATION_ERROR', 'DATABASE_URL must be PostgreSQL', 500);
  }
  const database = url.pathname.replace(/^\//, '');
  if (!database) {
    throw new ContentError('VALIDATION_ERROR', 'DATABASE_URL has no database name', 500);
  }
  return {
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(database),
  };
}

function timestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

export function createBackupService({
  mediaRoot,
  backupDir,
  databaseUrl,
  retention = 5,
  pgDumpPath = 'pg_dump',
  tarPath = 'tar',
  now = () => new Date(),
  logger,
}: BackupServiceOptions) {
  const keep = Math.max(1, Math.min(retention, 50));
  let running = false;

  function assertFileName(fileName: string): string {
    if (!BACKUP_NAME.test(fileName)) {
      throw new ContentError('NOT_FOUND', 'Backup not found', 404);
    }
    const absolute = path.resolve(backupDir, fileName);
    if (!absolute.startsWith(`${path.resolve(backupDir)}${path.sep}`)) {
      throw new ContentError('NOT_FOUND', 'Backup not found', 404);
    }
    return absolute;
  }

  async function listFiles(): Promise<BackupListResult> {
    await fs.mkdir(backupDir, { recursive: true });
    const entries = await fs.readdir(backupDir, { withFileTypes: true });
    const backups: BackupFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !BACKUP_NAME.test(entry.name)) continue;
      const stats = await fs.stat(path.join(backupDir, entry.name));
      backups.push({
        fileName: entry.name,
        sizeBytes: stats.size,
        createdAt: stats.mtime.toISOString(),
      });
    }
    backups.sort((left, right) => right.fileName.localeCompare(left.fileName));
    return { backups, retention: keep };
  }

  async function list(principal: Principal): Promise<BackupListResult> {
    requireCapability(principal, 'manage_options');
    return listFiles();
  }

  async function prune(): Promise<void> {
    const { backups } = await listFiles();
    const stale = backups.slice(keep);
    for (const entry of stale) {
      await fs.unlink(path.join(backupDir, entry.fileName)).catch(() => undefined);
    }
  }

  async function create(principal: Principal): Promise<BackupListResult> {
    requireCapability(principal, 'manage_options');
    if (running) {
      throw new ContentError(
        'VALIDATION_ERROR',
        'A backup is already running. Try again when it finishes.',
        409,
      );
    }
    running = true;
    const createdAt = now();
    const fileName = `mernpress-backup-${timestamp(createdAt)}.tar.gz`;
    const tempDir = path.join(backupDir, `.tmp-${process.pid}-${Date.now()}`);
    const finalPath = path.join(backupDir, fileName);
    try {
      await fs.mkdir(backupDir, { recursive: true });
      await fs.mkdir(tempDir, { recursive: true });
      await fs.mkdir(mediaRoot, { recursive: true });

      const db = parseDatabaseUrl(databaseUrl);
      const dumpPath = path.join(tempDir, 'database.sql');
      await execFileAsync(
        pgDumpPath,
        [
          '--host',
          db.host,
          '--port',
          db.port,
          '--username',
          db.user,
          '--dbname',
          db.database,
          '--no-owner',
          '--no-privileges',
          '--clean',
          '--if-exists',
          '--format=plain',
          `--file=${dumpPath}`,
        ],
        {
          env: { ...process.env, PGPASSWORD: db.password },
          timeout: 10 * 60 * 1000,
          maxBuffer: 1024 * 1024,
        },
      );

      const mediaArchive = path.join(tempDir, 'media.tar.gz');
      await execFileAsync(tarPath, ['-czf', mediaArchive, '-C', mediaRoot, '.'], {
        timeout: 10 * 60 * 1000,
        maxBuffer: 1024 * 1024,
      });

      await fs.writeFile(
        path.join(tempDir, 'MANIFEST.txt'),
        [
          'MERNPress backup',
          `format_version=${FORMAT_VERSION}`,
          `created_at=${createdAt.toISOString()}`,
          `database=${db.database}`,
          'contents=database.sql, media.tar.gz',
          'restore=docs/operations/backup-restore.md',
          '',
        ].join('\n'),
        { encoding: 'utf8', mode: 0o600 },
      );

      await execFileAsync(
        tarPath,
        ['-czf', finalPath, '-C', tempDir, 'database.sql', 'media.tar.gz', 'MANIFEST.txt'],
        { timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 },
      );
      await fs.chmod(finalPath, 0o600);
      await prune();
      return listFiles();
    } catch (error) {
      await fs.unlink(finalPath).catch(() => undefined);
      logger?.('backup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof ContentError) throw error;
      throw new ContentError(
        'BACKUP_FAILED',
        'The backup could not be created. Check the server logs.',
        500,
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      running = false;
    }
  }

  async function remove(principal: Principal, fileName: string): Promise<BackupListResult> {
    requireCapability(principal, 'manage_options');
    const absolute = assertFileName(fileName);
    try {
      await fs.unlink(absolute);
    } catch {
      throw new ContentError('NOT_FOUND', 'Backup not found', 404);
    }
    return listFiles();
  }

  /** Absolute path for the download route (administrator guard is at the route). */
  async function resolve(principal: Principal, fileName: string): Promise<string> {
    requireCapability(principal, 'manage_options');
    const absolute = assertFileName(fileName);
    try {
      const stats = await fs.stat(absolute);
      if (!stats.isFile()) throw new Error('not a file');
    } catch {
      throw new ContentError('NOT_FOUND', 'Backup not found', 404);
    }
    return absolute;
  }

  return { list, create, remove, resolve };
}

export type BackupService = ReturnType<typeof createBackupService>;
