import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJobQueueService } from '@mernpress/cms-core';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';
import { createJobHandlers } from '../src/jobs/handlers.js';
import { createJobWorker } from '../src/jobs/worker.js';

const execFileAsync = promisify(execFile);

interface BackupListShape {
  backups: Array<{ fileName: string; sizeBytes: number; createdAt: string }>;
  retention: number;
}

interface BackupCreateShape extends BackupListShape {
  job: { id: string; status: string; attempts: number; maxAttempts: number };
}

describe('backup packages', () => {
  let app: FastifyInstance;
  let headers: Record<string, string>;
  let cookie: string;
  let backupDir: string;

  beforeEach(async () => {
    backupDir = await fs.mkdtemp(path.join(tmpdir(), 'mernpress-backup-api-'));
    app = await createTestApp({ BACKUP_STORAGE_DIR: backupDir, BACKUP_RETENTION: 2 });
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    cookie = session.cookieHeader;
    headers = {
      origin: ADMIN_ORIGIN,
      cookie,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json',
    };
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(backupDir, { recursive: true, force: true });
  });

  const bodyless = () => {
    const { 'content-type': _contentType, ...rest } = headers;
    return rest;
  };

  function queue() {
    return createJobQueueService({ prisma: app.database });
  }

  function worker() {
    const jobs = queue();
    return createJobWorker({
      queue: jobs,
      handlers: createJobHandlers({
        prisma: app.database,
        notes: app.notes,
        analytics: app.analytics,
        jobs,
        backups: app.backups,
        media: app.media,
        mail: app.mail,
        mailSecret: 'test-only-auth-hash-pepper-2026-10-25-0123456789',
      }),
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      workerId: 'backup-test',
    });
  }

  async function createBackup(): Promise<BackupListShape> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/backups',
      headers: bodyless(),
    });
    expect(response.statusCode).toBe(202);
    expect((response.json() as BackupCreateShape).job.status).toBe('PENDING');
    expect((await worker().tick()).failed).toBe(0);
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/backups',
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    return list.json() as BackupListShape;
  }

  it('creates a gzip archive with the database dump, media and manifest', async () => {
    const body = await createBackup();
    expect(body.backups).toHaveLength(1);
    const file = body.backups[0]!;
    expect(file.fileName).toMatch(/^mernpress-backup-\d{8}T\d{6}Z\.tar\.gz$/);
    expect(file.sizeBytes).toBeGreaterThan(0);

    const download = await app.inject({
      method: 'GET',
      url: `/api/admin/backups/${file.fileName}/download`,
      headers: { cookie },
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('application/gzip');
    expect(String(download.headers['content-disposition'])).toContain(file.fileName);
    expect(download.rawPayload.subarray(0, 2).toString('hex')).toBe('1f8b');

    const tempFile = path.join(backupDir, 'downloaded.tar.gz');
    await fs.writeFile(tempFile, download.rawPayload);
    const { stdout } = await execFileAsync('tar', ['-tzf', tempFile]);
    expect(stdout).toContain('database.sql');
    expect(stdout).toContain('media.tar.gz');
    expect(stdout).toContain('MANIFEST.txt');
    const manifest = await execFileAsync('tar', ['-xOzf', tempFile, 'MANIFEST.txt']);
    expect(manifest.stdout).toContain('format_version=1');
    expect(manifest.stdout).toContain('database.sql, media.tar.gz');
  });

  it('lists, deletes and enforces the retention limit', async () => {
    await fs.writeFile(path.join(backupDir, 'mernpress-backup-20000101T000000Z.tar.gz'), 'old');
    await fs.writeFile(path.join(backupDir, 'mernpress-backup-20000102T000000Z.tar.gz'), 'older');

    const body = await createBackup();
    expect(body.retention).toBe(2);
    expect(body.backups.length).toBe(2);
    expect(body.backups.some((entry) => entry.fileName.includes('20000101'))).toBe(false);

    const target = body.backups[0]!;
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/admin/backups/${target.fileName}`,
      headers: bodyless(),
    });
    expect(deleted.statusCode).toBe(200);
    expect((deleted.json() as BackupListShape).backups).toHaveLength(1);

    const missing = await app.inject({
      method: 'DELETE',
      url: `/api/admin/backups/${target.fileName}`,
      headers: bodyless(),
    });
    expect(missing.statusCode).toBe(404);

    const traversal = await app.inject({
      method: 'GET',
      url: '/api/admin/backups/..%2F..%2Fetc%2Fpasswd/download',
      headers: { cookie },
    });
    expect(traversal.statusCode).toBe(400);
  });

  it('rejects anonymous and non-administrator callers', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/api/admin/backups' });
    expect(anonymous.statusCode).toBe(401);

    await seedUser(app, { username: 'editor', password: 'Editor-pass-2026!', role: 'editor' });
    const editor = await loginAs(app, 'editor', 'Editor-pass-2026!');
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/backups',
      headers: { cookie: editor.cookieHeader },
    });
    expect(forbidden.statusCode).toBe(403);

    const createForbidden = await app.inject({
      method: 'POST',
      url: '/api/admin/backups',
      headers: {
        origin: ADMIN_ORIGIN,
        cookie: editor.cookieHeader,
        'x-csrf-token': editor.csrfToken,
      },
    });
    expect(createForbidden.statusCode).toBe(403);
    expect(await app.database.job.count({ where: { type: 'backup.create' } })).toBe(0);
  });

  it('queues a backup job, exposes it through the admin API and completes it', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/backups',
      headers: bodyless(),
    });
    expect(response.statusCode).toBe(202);
    const created = response.json() as BackupCreateShape;
    expect(created.job.status).toBe('PENDING');

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/admin/backups',
      headers: bodyless(),
    });
    expect(duplicate.statusCode).toBe(409);

    const queued = await app.inject({
      method: 'GET',
      url: `/api/admin/jobs/${created.job.id}`,
      headers: { cookie },
    });
    expect(queued.statusCode).toBe(200);
    expect((queued.json() as { status: string }).status).toBe('PENDING');

    const result = await worker().tick();
    expect(result).toMatchObject({ claimed: 1, completed: 1, failed: 0 });

    const completed = await app.inject({
      method: 'GET',
      url: `/api/admin/jobs/${created.job.id}`,
      headers: { cookie },
    });
    expect((completed.json() as { status: string; attempts: number }).status).toBe('COMPLETED');
    expect((completed.json() as { attempts: number }).attempts).toBe(1);

    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/backups',
      headers: { cookie },
    });
    expect((list.json() as BackupListShape).backups).toHaveLength(1);
  });

  it('retries a failed backup job and marks it failed after maxAttempts', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/backups',
      headers: bodyless(),
    });
    const created = response.json() as BackupCreateShape;
    const failure = vi.spyOn(app.backups, 'createSystem').mockRejectedValue(new Error('boom'));

    const first = await worker().tick();
    expect(first.failed).toBe(1);
    let job = await app.database.job.findUniqueOrThrow({ where: { id: created.job.id } });
    expect(job.status).toBe('PENDING');
    expect(job.attempts).toBe(1);
    expect(job.lastError).toContain('boom');

    await app.database.job.update({
      where: { id: created.job.id },
      data: { scheduledAt: new Date(0) },
    });
    const second = await worker().tick();
    expect(second.failed).toBe(1);
    job = await app.database.job.findUniqueOrThrow({ where: { id: created.job.id } });
    expect(job.status).toBe('FAILED');
    expect(job.attempts).toBe(2);
    failure.mockRestore();
  });
});
