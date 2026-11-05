import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchNoteMentionCandidates } from '../api.js';
import { MentionTextarea } from './MentionTextarea.js';

vi.mock('../api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchNoteMentionCandidates: vi.fn(),
  };
});

function Harness() {
  const [value, setValue] = useState('');
  return (
    <div>
      <label htmlFor="note-body">Add a note</label>
      <MentionTextarea id="note-body" postId="p1" value={value} onChange={setValue} />
    </div>
  );
}

const candidates = [
  { id: 'u1', username: 'alice', displayName: 'Alice A' },
  { id: 'u2', username: 'bob', displayName: 'Bob B' },
];

function typeMention(textarea: HTMLTextAreaElement, value: string) {
  fireEvent.change(textarea, { target: { value } });
  const caret = value.length;
  textarea.setSelectionRange(caret, caret);
  fireEvent.click(textarea);
}

beforeEach(() => {
  vi.mocked(fetchNoteMentionCandidates).mockResolvedValue(candidates);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('mention textarea', () => {
  it('suggests eligible users as an @query is typed', async () => {
    render(<Harness />);
    const textarea = screen.getByLabelText('Add a note') as HTMLTextAreaElement;
    typeMention(textarea, 'Please review, @ali');

    expect(await screen.findByRole('listbox', { name: 'Mention suggestions' })).toBeDefined();
    await waitFor(() => expect(fetchNoteMentionCandidates).toHaveBeenCalledWith('p1', 'ali'));
    expect(await screen.findByText('Alice A')).toBeDefined();
    expect(screen.getByText('Bob B')).toBeDefined();
  });

  it('inserts the highlighted user with Arrow Down + Enter', async () => {
    render(<Harness />);
    const textarea = screen.getByLabelText('Add a note') as HTMLTextAreaElement;
    typeMention(textarea, 'Hi @a');
    await screen.findByRole('option', { name: /Alice A/ });

    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(textarea.value).toBe('Hi @bob '));
  });

  it('inserts a clicked user and closes on Escape', async () => {
    render(<Harness />);
    const textarea = screen.getByLabelText('Add a note') as HTMLTextAreaElement;
    typeMention(textarea, 'Thanks @a');
    const option = await screen.findByRole('option', { name: /Alice A/ });
    fireEvent.mouseDown(option);
    await waitFor(() => expect(textarea.value).toBe('Thanks @alice '));

    typeMention(textarea, 'Again @b');
    await screen.findByRole('listbox', { name: 'Mention suggestions' });
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Mention suggestions' })).toBeNull();
  });

  it('shows an empty state and does not open without an @ token', async () => {
    vi.mocked(fetchNoteMentionCandidates).mockResolvedValue([]);
    render(<Harness />);
    const textarea = screen.getByLabelText('Add a note') as HTMLTextAreaElement;

    typeMention(textarea, 'No mention yet');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.queryByRole('listbox', { name: 'Mention suggestions' })).toBeNull();

    typeMention(textarea, '@no');
    expect(await screen.findByText('No matching editors.')).toBeDefined();
  });
});
