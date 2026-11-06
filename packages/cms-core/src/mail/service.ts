import type { DatabaseClient } from '@mernpress/database';
import nodemailer from 'nodemailer';

/**
 * Transactional mail for comment notifications and new-account notices.
 *
 * The transport is configured from the server environment (SMTP) or, in
 * development and tests, an in-memory sink. When no transport is configured the
 * service reports that state and never pretends a message was delivered.
 */
export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export interface SentMail extends MailMessage {
  sentAt: string;
}

export interface MailTransport {
  readonly kind: 'smtp' | 'memory';
  send(message: MailMessage): Promise<void>;
  /** Present for the in-memory transport only. */
  readonly outbox?: SentMail[];
}

export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  user?: string | undefined;
  pass?: string | undefined;
}

export interface MailServiceOptions {
  prisma: DatabaseClient;
  transport: MailTransport | null;
  /** Default From header; the site title is used when unset. */
  from?: string | undefined;
  /** Admin base URL when the admin is on a different origin (development). */
  adminUrl?: string | undefined;
  logger?: (message: string, meta?: Record<string, unknown>) => void;
  /** When present, rendered messages are queued instead of sent inline. */
  queue?: ((message: MailMessage) => Promise<void>) | undefined;
}

export interface MailLogEntry {
  id: string;
  recipient: string;
  subject: string;
  status: 'sent' | 'failed';
  reason: string | null;
  createdAt: string;
}

export interface MailStatus {
  configured: boolean;
  transport: 'smtp' | 'memory' | null;
  from: string | null;
}

export interface MailResult {
  sent: boolean;
  /** True when the message was accepted by the durable mail queue. */
  queued?: boolean;
  reason?: string;
}

export interface CommentMailInput {
  postTitle: string;
  postSlug: string;
  authorName: string;
  authorEmail: string;
  content: string;
}

export interface CommentNotificationInput extends CommentMailInput {
  /** The post author's email, when the author is a user with one. */
  postAuthorEmail: string | null;
}

/** Editor-note activity notification. */
export interface NoteMailInput {
  postTitle: string;
  postSlug: string;
  /** Per-post override; undefined inherits the global `notes_notify` option. */
  enabled?: boolean | undefined;
  /** Display name or username of the person who acted. */
  actorName: string;
  /** Note or reply text. */
  content: string;
  kind: 'created' | 'reply' | 'deleted';
  /** Post author or note author; null falls back to the admin recipient. */
  recipientEmail: string | null;
}

/** A mention inside an editor note. */
export interface NoteMentionMailInput {
  postTitle: string;
  postSlug: string;
  /** Per-post override; undefined inherits the global `notes_notify` option. */
  enabled?: boolean | undefined;
  actorName: string;
  mentionedName: string;
  content: string;
  recipientEmail: string;
}

export interface NewUserMailInput {
  username: string;
  email: string;
  displayName: string | null;
  /** Single-use reset token, so the welcome email matches WordPress. */
  resetToken?: string | undefined;
}

export interface PasswordResetMailInput {
  to: string;
  username: string;
  token: string;
  expiresInMinutes: number;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXCERPT_LIMIT = 2000;
/** Rows kept in the delivery log; older rows are pruned after each write. */
const MAIL_LOG_LIMIT = 200;

function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function excerpt(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > EXCERPT_LIMIT ? `${trimmed.slice(0, EXCERPT_LIMIT)}…` : trimmed;
}

/** Nodemailer SMTP transport. Connection details come only from configuration. */
export function createSmtpMailTransport(options: SmtpTransportOptions): MailTransport {
  const transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    // A dead relay must not hang a comment submission for minutes.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    ...(options.user && options.pass ? { auth: { user: options.user, pass: options.pass } } : {}),
  });
  return {
    kind: 'smtp',
    async send(message) {
      await transporter.sendMail({
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    },
  };
}

/** In-memory sink used by tests and local verification; never used in production. */
export function createMemoryMailTransport(now: () => Date = () => new Date()): MailTransport {
  const outbox: SentMail[] = [];
  return {
    kind: 'memory',
    outbox,
    async send(message) {
      outbox.push({ ...message, sentAt: now().toISOString() });
    },
  };
}

export function createMailService({
  prisma,
  transport,
  from,
  adminUrl,
  logger,
  queue,
}: MailServiceOptions) {
  async function option<T>(key: string, fallback: T): Promise<T> {
    const row = await prisma.option.findUnique({ where: { key } });
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }

  async function siteContext(): Promise<{
    siteTitle: string;
    siteUrl: string;
    permalinkBase: string;
  }> {
    const [siteTitle, siteUrl, wordpressUrl, permalinkBase] = await Promise.all([
      option<string>('site_title', 'MERNPress'),
      option<string>('site_url', ''),
      option<string>('wordpress_url', ''),
      option<string>('permalink_base', 'posts'),
    ]);
    return {
      siteTitle: siteTitle || 'MERNPress',
      siteUrl: (siteUrl || wordpressUrl || '').replace(/\/+$/, ''),
      permalinkBase: permalinkBase || 'posts',
    };
  }

  function postUrl(siteUrl: string, permalinkBase: string, slug: string): string {
    const path = `/${permalinkBase}/${encodeURIComponent(slug)}`;
    return siteUrl ? `${siteUrl}${path}` : path;
  }

  function adminBase(siteUrl: string): string {
    if (adminUrl && adminUrl.trim()) return adminUrl.trim().replace(/\/+$/, '');
    return `${siteUrl}/admin`.replace(/\/+$/, '');
  }

  function adminLink(siteUrl: string, path: string): string {
    const base = adminBase(siteUrl);
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  function resetLink(siteUrl: string, token: string, username: string): string {
    return `${adminBase(siteUrl)}/?action=rp&key=${encodeURIComponent(token)}&login=${encodeURIComponent(username)}`;
  }

  function defaultFrom(siteTitle: string): string {
    return from && from.trim() ? from.trim() : `${siteTitle} <no-reply@mernpress.local>`;
  }

  /** WordPress's admin recipient: the General admin email, else an administrator. */
  async function adminRecipient(): Promise<string | null> {
    const configured = (await option<string>('admin_email', '')).trim();
    if (configured && EMAIL_PATTERN.test(configured)) return configured;
    const admin = await prisma.user.findFirst({
      where: { role: 'administrator', status: 'active', email: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { email: true },
    });
    return admin?.email && EMAIL_PATTERN.test(admin.email) ? admin.email : null;
  }

  /** Delivery log: metadata only, never the message body or credentials. */
  async function writeLog(entry: {
    recipient: string;
    subject: string;
    status: 'sent' | 'failed';
    reason?: string | null;
  }): Promise<void> {
    try {
      await prisma.mailLogEntry.create({
        data: {
          recipient: entry.recipient.slice(0, 320),
          subject: entry.subject.slice(0, 500),
          status: entry.status,
          reason: entry.reason?.slice(0, 100) ?? null,
        },
      });
      const stale = await prisma.mailLogEntry.findMany({
        orderBy: { createdAt: 'desc' },
        skip: MAIL_LOG_LIMIT,
        take: 200,
        select: { id: true },
      });
      if (stale.length > 0) {
        await prisma.mailLogEntry.deleteMany({
          where: { id: { in: stale.map((row) => row.id) } },
        });
      }
    } catch (error) {
      logger?.('mail log write failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Send a rendered message now and record the outcome. Used by the worker. */
  async function sendDirect(message: MailMessage): Promise<MailResult> {
    if (!transport) {
      return { sent: false, reason: 'not-configured' };
    }
    if (!message.to || !EMAIL_PATTERN.test(message.to)) {
      await writeLog({
        recipient: message.to ?? '',
        subject: message.subject,
        status: 'failed',
        reason: 'no-recipient',
      });
      return { sent: false, reason: 'no-recipient' };
    }
    try {
      await transport.send(message);
      await writeLog({
        recipient: message.to,
        subject: message.subject,
        status: 'sent',
      });
      return { sent: true };
    } catch (error) {
      logger?.('mail delivery failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      await writeLog({
        recipient: message.to,
        subject: message.subject,
        status: 'failed',
        reason: 'transport-failed',
      });
      return { sent: false, reason: 'transport-failed' };
    }
  }

  async function deliver(
    to: string | null,
    build: () => Promise<{ subject: string; text: string }>,
  ): Promise<MailResult> {
    if (!transport) {
      return { sent: false, reason: 'not-configured' };
    }
    if (!to || !EMAIL_PATTERN.test(to)) {
      await writeLog({
        recipient: to ?? '',
        subject: '',
        status: 'failed',
        reason: 'no-recipient',
      });
      return { sent: false, reason: 'no-recipient' };
    }
    let subject = '';
    try {
      const context = await siteContext();
      const built = await build();
      subject = built.subject;
      const message: MailMessage = {
        from: defaultFrom(context.siteTitle),
        to,
        subject: built.subject,
        text: built.text,
      };
      if (queue) {
        try {
          await queue(message);
          return { sent: false, queued: true, reason: 'queued' };
        } catch (error) {
          logger?.('mail queue failed', {
            error: error instanceof Error ? error.message : String(error),
          });
          await writeLog({
            recipient: to,
            subject,
            status: 'failed',
            reason: 'queue-failed',
          });
          return { sent: false, reason: 'queue-failed' };
        }
      }
      return await sendDirect(message);
    } catch (error) {
      logger?.('mail delivery failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      await writeLog({
        recipient: to,
        subject,
        status: 'failed',
        reason: 'transport-failed',
      });
      return { sent: false, reason: 'transport-failed' };
    }
  }

  async function notifyModeration(input: CommentMailInput): Promise<MailResult> {
    const enabled = await option<boolean>('moderation_notify', true);
    if (!enabled) return { sent: false, reason: 'disabled' };
    const recipient = await adminRecipient();
    return deliver(recipient, async () => {
      const context = await siteContext();
      const permalink = postUrl(context.siteUrl, context.permalinkBase, input.postSlug);
      return {
        subject: `[${context.siteTitle}] Please moderate: "${singleLine(input.postTitle)}"`,
        text: [
          'A new comment on your site is waiting for your approval.',
          '',
          `Post: ${singleLine(input.postTitle)}`,
          permalink,
          '',
          `Author: ${singleLine(input.authorName)} (${input.authorEmail})`,
          'Comment:',
          excerpt(input.content),
          '',
          `Approve it: ${adminLink(context.siteUrl, '/comments?status=PENDING')}`,
        ].join('\n'),
      };
    });
  }

  async function notifyComment(input: CommentNotificationInput): Promise<MailResult> {
    const enabled = await option<boolean>('comments_notify', true);
    if (!enabled) return { sent: false, reason: 'disabled' };
    const recipient =
      input.postAuthorEmail && EMAIL_PATTERN.test(input.postAuthorEmail)
        ? input.postAuthorEmail
        : await adminRecipient();
    return deliver(recipient, async () => {
      const context = await siteContext();
      const permalink = postUrl(context.siteUrl, context.permalinkBase, input.postSlug);
      return {
        subject: `[${context.siteTitle}] New comment on "${singleLine(input.postTitle)}"`,
        text: [
          'A new comment was published on your site.',
          '',
          `Post: ${singleLine(input.postTitle)}`,
          permalink,
          '',
          `Author: ${singleLine(input.authorName)} (${input.authorEmail})`,
          'Comment:',
          excerpt(input.content),
          '',
          `Manage comments: ${adminLink(context.siteUrl, '/comments')}`,
        ].join('\n'),
      };
    });
  }

  async function notifyNote(input: NoteMailInput): Promise<MailResult> {
    const enabled =
      input.enabled === undefined ? await option<boolean>('notes_notify', true) : input.enabled;
    if (!enabled) return { sent: false, reason: 'disabled' };
    const recipient =
      input.recipientEmail && EMAIL_PATTERN.test(input.recipientEmail)
        ? input.recipientEmail
        : await adminRecipient();
    const action =
      input.kind === 'deleted'
        ? 'had a note deleted'
        : input.kind === 'reply'
          ? 'replied to a note'
          : 'added an editor note';
    return deliver(recipient, async () => {
      const context = await siteContext();
      const permalink = postUrl(context.siteUrl, context.permalinkBase, input.postSlug);
      return {
        subject: `[${context.siteTitle}] ${singleLine(input.actorName)} ${action} on "${singleLine(input.postTitle)}"`,
        text: [
          `${singleLine(input.actorName)} ${action} on "${singleLine(input.postTitle)}".`,
          '',
          `Post: ${singleLine(input.postTitle)}`,
          permalink,
          '',
          'Note:',
          excerpt(input.content),
          '',
          `Open the editor: ${adminLink(context.siteUrl, '/posts')}`,
        ].join('\n'),
      };
    });
  }

  async function notifyNoteMention(input: NoteMentionMailInput): Promise<MailResult> {
    const enabled =
      input.enabled === undefined ? await option<boolean>('notes_notify', true) : input.enabled;
    if (!enabled) return { sent: false, reason: 'disabled' };
    const recipient =
      input.recipientEmail && EMAIL_PATTERN.test(input.recipientEmail)
        ? input.recipientEmail
        : null;
    return deliver(recipient, async () => {
      const context = await siteContext();
      const permalink = postUrl(context.siteUrl, context.permalinkBase, input.postSlug);
      return {
        subject: `[${context.siteTitle}] ${singleLine(input.actorName)} mentioned you in a note on "${singleLine(input.postTitle)}"`,
        text: [
          `${singleLine(input.actorName)} mentioned you in an editor note on "${singleLine(input.postTitle)}".`,
          '',
          `Post: ${singleLine(input.postTitle)}`,
          permalink,
          '',
          `Hi ${singleLine(input.mentionedName)},`,
          excerpt(input.content),
          '',
          `Open the editor: ${adminLink(context.siteUrl, '/posts')}`,
        ].join('\n'),
      };
    });
  }

  async function notifyPasswordReset(input: PasswordResetMailInput): Promise<MailResult> {
    return deliver(input.to, async () => {
      const context = await siteContext();
      const hours = Math.max(1, Math.round(input.expiresInMinutes / 60));
      return {
        subject: `[${context.siteTitle}] Password Reset`,
        text: [
          'Someone requested a password reset for the following account:',
          '',
          `Username: ${input.username}`,
          '',
          'If this was a mistake, ignore this email and nothing will happen.',
          '',
          'To reset your password, visit the following address:',
          resetLink(context.siteUrl, input.token, input.username),
          '',
          `This link expires in ${hours} hour${hours === 1 ? '' : 's'}.`,
        ].join('\n'),
      };
    });
  }

  async function notifyNewUser(input: NewUserMailInput): Promise<MailResult> {
    return deliver(input.email, async () => {
      const context = await siteContext();
      return {
        subject: `[${context.siteTitle}] Your new account`,
        text: [
          `Welcome to ${context.siteTitle}.`,
          '',
          `Username: ${input.username}`,
          ...(input.displayName ? [`Display name: ${input.displayName}`] : []),
          '',
          `Log in: ${adminLink(context.siteUrl, '/')}`,
          ...(input.resetToken
            ? [
                '',
                'To set your password, visit the following address:',
                resetLink(context.siteUrl, input.resetToken, input.username),
                '',
                'If this was a mistake, ignore this email.',
              ]
            : [
                'An administrator created this account and set its password. If you do not know it, ask the site administrator to reset it.',
              ]),
        ].join('\n'),
      };
    });
  }

  function status(): MailStatus {
    return {
      configured: transport !== null,
      transport: transport?.kind ?? null,
      from: transport ? (from && from.trim() ? from.trim() : null) : null,
    };
  }

  async function log(limit = 100): Promise<MailLogEntry[]> {
    const rows = await prisma.mailLogEntry.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), MAIL_LOG_LIMIT),
    });
    return rows.map((row) => ({
      id: row.id,
      recipient: row.recipient,
      subject: row.subject,
      status: row.status === 'failed' ? 'failed' : 'sent',
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async function clearLog(): Promise<void> {
    await prisma.mailLogEntry.deleteMany({});
  }

  return {
    status,
    sendDirect,
    notifyModeration,
    notifyComment,
    notifyNote,
    notifyNoteMention,
    notifyNewUser,
    notifyPasswordReset,
    log,
    clearLog,
    /** Messages captured by the in-memory transport (tests/dev only). */
    outbox: transport?.outbox ?? [],
  };
}

export type MailService = ReturnType<typeof createMailService>;
