import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createJobQueueService,
  createMailService,
  createMemoryMailTransport,
  openMailMessage,
  sealMailMessage,
} from '@mernpress/cms-core';
import { createTestApp } from './helpers/auth.js';
import { createJobHandlers } from '../src/jobs/handlers.js';
import { createJobWorker } from '../src/jobs/worker.js';

const SECRET = 'test-only-auth-hash-pepper-2026-10-25-0123456789';

let app: FastifyInstance;

beforeEach(async () => {
  app = await createTestApp({ MAIL_TRANSPORT: 'memory' });
});

afterEach(async () => {
  await app.close();
});

function handlers(queue: ReturnType<typeof createJobQueueService>, mail: typeof app.mail) {
  return createJobHandlers({
    prisma: app.database,
    notes: app.notes,
    analytics: app.analytics,
    jobs: queue,
    backups: app.backups,
    media: app.media,
    linkChecks: app.linkChecks,
    mail,
    mailSecret: SECRET,
  });
}

function worker(queue: ReturnType<typeof createJobQueueService>, mail: typeof app.mail) {
  return createJobWorker({
    queue,
    handlers: handlers(queue, mail),
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    workerId: 'mail-queue-test',
  });
}

describe('durable mail delivery', () => {
  it('seals the message so tokens and bodies stay out of the job payload', () => {
    const message = {
      from: 'MERNPress <no-reply@example.com>',
      to: 'user@example.com',
      subject: 'Reset your password',
      text: 'Use this token: SUPER-SECRET-RESET-TOKEN',
    };
    const sealed = sealMailMessage(message, SECRET);
    expect(JSON.stringify(sealed)).not.toContain('SUPER-SECRET-RESET-TOKEN');
    expect(JSON.stringify(sealed)).not.toContain('user@example.com');
    expect(openMailMessage(sealed, SECRET)).toEqual(message);
    expect(() => openMailMessage({ ...sealed, data: 'AAAA' }, SECRET)).toThrow(
      'could not be opened',
    );
  });

  it('delivers a queued message and marks the job completed', async () => {
    const queue = createJobQueueService({ prisma: app.database });
    const sealed = sealMailMessage(
      {
        from: 'MERNPress <no-reply@example.com>',
        to: 'recipient@example.com',
        subject: 'Queued subject',
        text: 'Queued body',
      },
      SECRET,
    );
    const job = await queue.enqueue({
      type: 'mail.send',
      payload: { ...sealed },
      maxAttempts: 2,
    });

    const result = await worker(queue, app.mail).tick();
    expect(result).toMatchObject({ claimed: 1, completed: 1, failed: 0 });
    expect(app.mail.outbox).toHaveLength(1);
    expect(app.mail.outbox[0]).toMatchObject({
      to: 'recipient@example.com',
      subject: 'Queued subject',
      text: 'Queued body',
    });
    const row = await app.database.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe('COMPLETED');
    expect(await app.mail.log()).toEqual([
      expect.objectContaining({ recipient: 'recipient@example.com', status: 'sent' }),
    ]);
  });

  it('retries a transport failure and fails the job at maxAttempts', async () => {
    const failingMail = createMailService({
      prisma: app.database,
      transport: {
        kind: 'memory',
        send: async () => {
          throw new Error('smtp down');
        },
      },
    });
    const queue = createJobQueueService({ prisma: app.database });
    const sealed = sealMailMessage(
      {
        from: 'MERNPress <no-reply@example.com>',
        to: 'recipient@example.com',
        subject: 'Failing',
        text: 'Body',
      },
      SECRET,
    );
    const job = await queue.enqueue({
      type: 'mail.send',
      payload: { ...sealed },
      maxAttempts: 2,
    });

    expect(await worker(queue, failingMail).tick()).toMatchObject({ failed: 1 });
    let row = await app.database.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain('transport-failed');

    await app.database.job.update({
      where: { id: job.id },
      data: { scheduledAt: new Date(0) },
    });
    expect(await worker(queue, failingMail).tick()).toMatchObject({ failed: 1 });
    row = await app.database.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe('FAILED');
    expect(row.attempts).toBe(2);
  });

  it('queues a notification from the mail service instead of sending inline', async () => {
    const queued: Array<{ to: string; text: string }> = [];
    const mail = createMailService({
      prisma: app.database,
      transport: createMemoryMailTransport(),
      queue: async (message) => {
        queued.push({ to: message.to, text: message.text });
      },
    });

    const result = await mail.notifyPasswordReset({
      to: 'reset@example.com',
      username: 'alice',
      token: 'RESET-TOKEN-123',
      expiresInMinutes: 60,
    });
    expect(result).toEqual({ sent: false, queued: true, reason: 'queued' });
    expect(mail.outbox).toHaveLength(0);
    expect(queued).toHaveLength(1);
    expect(queued[0]?.to).toBe('reset@example.com');
    expect(queued[0]?.text).toContain('RESET-TOKEN-123');
  });
});
