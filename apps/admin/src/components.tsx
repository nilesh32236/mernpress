import type { ReactNode } from 'react';
import type { PostStatus } from './api.js';
import { statusLabel } from './roles.js';

export type NoticeTone = 'success' | 'error' | 'warning' | 'info';

export interface NoticeMessage {
  tone: NoticeTone;
  text: string;
  details?: string[];
}

export function Notice({ notice, onDismiss }: { notice: NoticeMessage; onDismiss?: () => void }) {
  const role = notice.tone === 'error' ? 'alert' : 'status';
  return (
    <div
      className={`notice notice-${notice.tone}`}
      role={role}
      aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
    >
      <div className="notice-copy">
        <p>{notice.text}</p>
        {notice.details && notice.details.length > 0 ? (
          <ul>
            {notice.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="notice-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss message"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: PostStatus }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>{statusLabel(status)}</span>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <p className="loading-state" role="status" aria-live="polite">
      {label}
    </p>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="button secondary-button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <p className="lede">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string | undefined }) {
  if (!message) {
    return null;
  }
  return (
    <p className="field-error" id={id}>
      {message}
    </p>
  );
}
