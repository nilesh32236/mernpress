import { useEffect, useId, type ReactNode } from 'react';
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
  count,
}: {
  /** Legacy prop kept for callers; WordPress page headers have no eyebrow. */
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** WordPress count bubble printed next to the title (Themes, Plugins). */
  count?: number | undefined;
}) {
  return (
    <div className="page-header">
      <div className="page-header-title">
        <div className="page-header-heading">
          <h1>{title}</h1>
          {typeof count === 'number' ? (
            <span className="page-count" aria-hidden="true">
              {count}
            </span>
          ) : null}
        </div>
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

/**
 * WordPress list-table sort indicator: two stacked 10x4 CSS triangles, the
 * active direction dark (#1d2327) and the other grey (#a7aaad).
 */
export function SortIndicator({ direction }: { direction: 'asc' | 'desc' | null }) {
  return (
    <span className="sorting-indicators" aria-hidden="true">
      <span className={`sorting-indicator asc${direction === 'asc' ? ' is-sorted' : ''}`} />
      <span className={`sorting-indicator desc${direction === 'desc' ? ' is-sorted' : ''}`} />
    </span>
  );
}

/**
 * WordPress tablenav pagination: « ‹ [page] of N › » with a page-number input.
 * The old "Page X of Y" text is kept as a screen-reader node for tests/a11y.
 */
export function Pagination({
  page,
  totalPages,
  total,
  singular,
  plural,
  ariaLabel,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  singular: string;
  plural: string;
  ariaLabel: string;
  onChange: (page: number) => void;
}) {
  const inputId = useId();
  if (totalPages <= 1) {
    return null;
  }
  return (
    <nav className="pagination" aria-label={ariaLabel}>
      <div className="tablenav-pages">
        <span className="displaying-num">
          {total} {total === 1 ? singular : plural}
        </span>
        <span className="pagination-links">
          <button
            type="button"
            className="button secondary-button pagination-button"
            aria-label="First page"
            title="First page"
            disabled={page <= 1}
            onClick={() => onChange(1)}
          >
            «
          </button>
          <button
            type="button"
            className="button secondary-button pagination-button"
            aria-label="Previous page"
            title="Previous page"
            disabled={page <= 1}
            onClick={() => onChange(Math.max(1, page - 1))}
          >
            ‹
          </button>
          <span className="paging-input">
            <span className="page-numbers current">
              Page {page} of {totalPages}
            </span>
            <label htmlFor={inputId} className="screen-reader-text">
              Current Page
            </label>
            <input
              id={inputId}
              className="current-page"
              type="number"
              min={1}
              max={totalPages}
              value={page}
              onChange={(event) => {
                const next = Math.min(totalPages, Math.max(1, Number(event.target.value) || 1));
                onChange(next);
              }}
            />
            <span className="tablenav-paging-text">
              {' '}
              of <span className="total-pages">{totalPages}</span>
            </span>
          </span>
          <button
            type="button"
            className="button secondary-button pagination-button"
            aria-label="Next page"
            title="Next page"
            disabled={page >= totalPages}
            onClick={() => onChange(Math.min(totalPages, page + 1))}
          >
            ›
          </button>
          <button
            type="button"
            className="button secondary-button pagination-button"
            aria-label="Last page"
            title="Last page"
            disabled={page >= totalPages}
            onClick={() => onChange(totalPages)}
          >
            »
          </button>
        </span>
      </div>
    </nav>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay">
      <div className="content-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
