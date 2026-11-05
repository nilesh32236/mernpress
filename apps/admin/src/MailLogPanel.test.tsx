import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMailLog, fetchMailLog, fetchMailStatus, type MailLogEntry } from './api.js';
import { MailLogPanel } from './MailLogPanel.js';

vi.mock('./api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchMailStatus: vi.fn(),
    fetchMailLog: vi.fn(),
    clearMailLog: vi.fn(),
  };
});

const entries: MailLogEntry[] = [
  {
    id: 'm1',
    recipient: 'admin@example.com',
    subject: '[MERNPress] New comment on "Hello"',
    status: 'sent',
    reason: null,
    createdAt: '2026-11-05T09:00:00.000Z',
  },
  {
    id: 'm2',
    recipient: 'invitee@example.com',
    subject: '[MERNPress] Your new account',
    status: 'failed',
    reason: 'transport-failed',
    createdAt: '2026-11-05T08:00:00.000Z',
  },
];

beforeEach(() => {
  vi.mocked(fetchMailStatus).mockResolvedValue({
    configured: true,
    transport: 'smtp',
    from: 'MERNPress <no-reply@example.com>',
  });
  vi.mocked(fetchMailLog).mockResolvedValue(entries);
  vi.mocked(clearMailLog).mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('mail log panel', () => {
  it('shows transport status and delivery metadata, never bodies', async () => {
    render(<MailLogPanel />);
    expect(await screen.findByText('admin@example.com')).toBeDefined();
    expect(screen.getByText('SMTP')).toBeDefined();
    expect(screen.getByText('MERNPress <no-reply@example.com>')).toBeDefined();
    expect(screen.getByText('Sent')).toBeDefined();
    expect(screen.getByText('Failed')).toBeDefined();
    expect(screen.getByText(/transport-failed/)).toBeDefined();
    expect(screen.queryByText(/body/i)).toBeNull();
  });

  it('clears the log after confirmation', async () => {
    render(<MailLogPanel />);
    await screen.findByText('admin@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Clear log' }));

    await waitFor(() => expect(vi.mocked(clearMailLog)).toHaveBeenCalled());
    expect(await screen.findByText('Mail log cleared.')).toBeDefined();
    expect(screen.getByText('No mail has been sent yet.')).toBeDefined();
  });

  it('explains when outbound mail is not configured', async () => {
    vi.mocked(fetchMailStatus).mockResolvedValue({
      configured: false,
      transport: null,
      from: null,
    });
    vi.mocked(fetchMailLog).mockResolvedValue([]);
    render(<MailLogPanel />);
    expect(await screen.findByText('Not configured')).toBeDefined();
    expect(screen.getByText(/Outbound mail is disabled until SMTP is configured/)).toBeDefined();
  });
});
