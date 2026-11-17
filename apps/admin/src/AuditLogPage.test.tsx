import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  fetchAuditEvents,
  fetchSession,
  type AdminAuditEvent,
  type Paged,
} from './api.js';
import { App } from './App.js';
import { AuditLogPage } from './AuditLogPage.js';

vi.mock('./api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchAuditEvents: vi.fn(),
    fetchSession: vi.fn(),
  };
});

const ALL_EVENT_TYPES = [
  'auth.bootstrap',
  'auth.manual_test_account.created',
  'auth.login.success',
  'auth.login.failure',
  'auth.login.rate_limited',
  'auth.logout',
  'auth.session.revoked',
  'user.created',
  'user.role.changed',
  'user.status.changed',
  'user.password.reset',
  'user.deleted',
  'user.profile.updated',
  'user.password.changed',
];

function makeEvent(overrides: Partial<AdminAuditEvent> = {}): AdminAuditEvent {
  return {
    id: 'evt-1',
    eventType: 'auth.login.success',
    actorUserId: 'user-abcdef123456',
    targetUserId: 'user-abcdef123456',
    createdAt: '2026-11-17T10:30:00.000Z',
    metadata: { role: 'administrator' },
    ...overrides,
  };
}

function list(
  items: AdminAuditEvent[],
  total = items.length,
  totalPages = Math.max(1, Math.ceil(total / 20)),
): Paged<AdminAuditEvent> {
  return { items, pagination: { page: 1, perPage: 20, total, totalPages } };
}

function rowFor(eventType: string): HTMLElement {
  const table = screen.getByRole('table');
  const cell = within(table).getByText(eventType);
  const row = cell.closest('tr');
  if (!row) throw new Error(`No row for ${eventType}`);
  return row;
}

beforeEach(() => {
  vi.mocked(fetchAuditEvents).mockResolvedValue(
    list([
      makeEvent(),
      makeEvent({
        id: 'evt-2',
        eventType: 'user.role.changed',
        actorUserId: 'admin-0001',
        targetUserId: 'editor-0002',
        createdAt: '2026-11-16T09:00:00.000Z',
        metadata: { fromRole: 'editor', toRole: 'administrator' },
      }),
      makeEvent({
        id: 'evt-3',
        eventType: 'auth.login.rate_limited',
        actorUserId: null,
        targetUserId: null,
        createdAt: '2026-11-15T08:00:00.000Z',
        metadata: { reason: 'threshold_reached', ipHash: 'secret-ip', identifierHash: 'secret-id' },
      }),
    ]),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('audit log page', () => {
  it('renders rows with UTC time, short ids and allow-listed metadata only', async () => {
    render(<AuditLogPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('auth.login.success')).toBeDefined();
    expect(within(table).getByText('user.role.changed')).toBeDefined();
    expect(within(table).getAllByText('user-abc…')).toHaveLength(2); // actor + target
    expect(within(table).getByText('role: administrator')).toBeDefined();
    expect(within(table).getByText('fromRole: editor')).toBeDefined();
    expect(within(table).getByText('toRole: administrator')).toBeDefined();
    const timeCells = table.querySelectorAll('td.column-time');
    expect(timeCells).toHaveLength(3);
    for (const cell of timeCells) {
      expect(cell.textContent).toMatch(/UTC$/);
    }

    const nullRow = rowFor('auth.login.rate_limited');
    expect(within(nullRow).getAllByText('—')).toHaveLength(2); // actor + target
    expect(within(nullRow).getByText('reason: threshold_reached')).toBeDefined();

    // Defence in depth: even if a backend regression leaked hashes, the UI drops them.
    expect(document.body.textContent).not.toContain('secret-ip');
    expect(document.body.textContent).not.toContain('secret-id');
    expect(document.body.textContent).not.toContain('ipHash');
  });

  it('offers all 14 event types and filters by the selected one', async () => {
    vi.mocked(fetchAuditEvents).mockImplementation(async (params = {}) =>
      params.eventType ? list([makeEvent({ eventType: params.eventType })]) : list([makeEvent()]),
    );

    render(<AuditLogPage />);
    await screen.findByRole('table');

    const select = screen.getByLabelText('Event type') as HTMLSelectElement;
    const options = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options[0]).toBe('All event types');
    for (const type of ALL_EVENT_TYPES) {
      expect(options).toContain(type);
    }
    expect(options).toHaveLength(ALL_EVENT_TYPES.length + 1);

    fireEvent.change(select, { target: { value: 'user.deleted' } });

    await waitFor(() =>
      expect(fetchAuditEvents).toHaveBeenLastCalledWith({
        eventType: 'user.deleted',
        page: 1,
        perPage: 20,
      }),
    );
    const table = await screen.findByRole('table');
    expect(within(table).getByText('user.deleted')).toBeDefined();
  });

  it('moves between pages', async () => {
    vi.mocked(fetchAuditEvents).mockResolvedValue(list([makeEvent()], 45, 3));

    render(<AuditLogPage />);
    await screen.findByRole('table');

    expect(screen.getByText(/Page 1 of 3/)).toBeDefined();
    expect((screen.getByRole('button', { name: '« Previous' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    const next = screen.getByRole('button', { name: 'Next »' }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);

    fireEvent.click(next);

    await waitFor(() =>
      expect(fetchAuditEvents).toHaveBeenLastCalledWith({ page: 2, perPage: 20 }),
    );
    expect(await screen.findByText(/Page 2 of 3/)).toBeDefined();
  });

  it('shows an empty state when no events are recorded', async () => {
    vi.mocked(fetchAuditEvents).mockResolvedValue(list([]));

    render(<AuditLogPage />);

    expect(await screen.findByText('No audit events found')).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows a retryable error state when the API fails', async () => {
    vi.mocked(fetchAuditEvents).mockRejectedValueOnce(
      new ApiError(500, 'REQUEST_FAILED', 'Audit backend offline'),
    );

    render(<AuditLogPage />);

    expect(await screen.findByText('Could not load audit events')).toBeDefined();
    expect(screen.getByText('Audit backend offline')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchAuditEvents).toHaveBeenCalledTimes(2));
  });

  it('renders Forbidden and hides the nav entry for non-admins', async () => {
    window.history.replaceState(null, '', '/admin/audit');
    vi.mocked(fetchSession).mockResolvedValue({
      id: 'u2',
      username: 'editor',
      role: 'editor',
      status: 'active',
    });

    render(<App />);

    expect(await screen.findByText('Only administrators can open this screen.')).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Audit Log' })).toBeNull();
    expect(fetchAuditEvents).not.toHaveBeenCalled();
  });
});
