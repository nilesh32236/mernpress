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
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
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

export function Skeleton({ label = 'Loading…', lines = 4 }: { label?: string; lines?: number }) {
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="skeleton-line" aria-hidden="true" />
      ))}
    </div>
  );
}

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export function Breadcrumbs({
  items,
  onNavigate,
}: {
  items: BreadcrumbItem[];
  onNavigate?: (to: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {isLast || !item.to ? (
                <span aria-current={isLast ? 'page' : undefined}>{item.label}</span>
              ) : (
                <a
                  href={item.to}
                  onClick={(event) => {
                    event.preventDefault();
                    if (onNavigate) {
                      onNavigate(item.to as string);
                    } else {
                      window.history.pushState(null, '', item.to as string);
                      window.dispatchEvent(new Event('mernpress:navigate'));
                    }
                  }}
                >
                  {item.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
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
      <svg
        className="empty-state-icon"
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
      <h2>{title}</h2>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  /** Legacy prop kept for callers; WordPress page headers have no eyebrow. */
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
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
