import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { MailMessage } from './service.js';

const VERSION = 1;
const ALGORITHM = 'aes-256-gcm';
const AAD = Buffer.from('mernpress-mail-queue-v1');

export interface SealedMailPayload {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

function keyFromSecret(secret: string): Buffer {
  if (secret.length < 16) {
    throw new Error('The mail queue secret must be at least 16 characters.');
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

/**
 * Encrypt a rendered mail message before it enters the durable job queue.
 *
 * Jobs are visible to administrators through `GET /api/admin/jobs`, and a
 * reset/welcome message contains a single-use token. Sealing keeps the
 * recipient, subject and body out of the job payload while the worker still
 * receives everything it needs.
 */
export function sealMailMessage(message: MailMessage, secret: string): SealedMailPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyFromSecret(secret), iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([cipher.update(JSON.stringify(message), 'utf8'), cipher.final()]);
  return {
    v: VERSION,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

function isMailMessage(value: unknown): value is MailMessage {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['from'] === 'string' &&
    record['from'].length > 0 &&
    record['from'].length <= 500 &&
    typeof record['to'] === 'string' &&
    record['to'].length > 0 &&
    record['to'].length <= 320 &&
    typeof record['subject'] === 'string' &&
    record['subject'].length <= 500 &&
    typeof record['text'] === 'string' &&
    record['text'].length <= 60_000
  );
}

export function openMailMessage(payload: unknown, secret: string): MailMessage {
  if (payload === null || typeof payload !== 'object') {
    throw new Error('Invalid queued mail payload.');
  }
  const sealed = payload as Partial<SealedMailPayload>;
  if (
    sealed.v !== VERSION ||
    typeof sealed.iv !== 'string' ||
    typeof sealed.tag !== 'string' ||
    typeof sealed.data !== 'string'
  ) {
    throw new Error('Invalid queued mail payload.');
  }
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      keyFromSecret(secret),
      Buffer.from(sealed.iv, 'base64'),
    );
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    const json = Buffer.concat([
      decipher.update(Buffer.from(sealed.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (!isMailMessage(parsed)) throw new Error('invalid message shape');
    return parsed;
  } catch {
    throw new Error('Queued mail payload could not be opened.');
  }
}
