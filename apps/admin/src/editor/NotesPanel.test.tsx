import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostNote } from '../api.js';
import { NotesPanel } from './NotesPanel.js';
import type { PostNotesState } from './usePostNotes.js';

function note(overrides: Partial<PostNote> = {}): PostNote {
  return {
    id: 'n1',
    postId: 'p1',
    parentId: null,
    content: 'Please tighten this paragraph.',
    author: { id: 'u1', username: 'admin', displayName: null },
    createdAt: '2026-11-05T10:00:00.000Z',
    resolvedAt: null,
    resolvedBy: null,
    block: null,
    ...overrides,
  };
}

function state(overrides: Partial<PostNotesState> = {}): PostNotesState {
  return {
    notes: [],
    loading: false,
    error: null,
    busy: false,
    unresolvedCount: 0,
    add: vi.fn(async () => true),
    reply: vi.fn(async () => true),
    setResolved: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    refresh: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe('editor notes panel', () => {
  it('asks the author to save the draft first', () => {
    render(<NotesPanel postId={null} state={state()} />);
    expect(screen.getByText(/Save the draft first/)).toBeDefined();
  });

  it('adds a note and clears the composer', async () => {
    const notes = state();
    render(<NotesPanel postId="p1" state={notes} />);

    fireEvent.change(screen.getByLabelText('Add a note'), {
      target: { value: '  Check the intro.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));

    await waitFor(() => expect(notes.add).toHaveBeenCalledWith('Check the intro.', null));
    expect((screen.getByLabelText('Add a note') as HTMLTextAreaElement).value).toBe('');
  });

  it('renders threads, replies and resolution state', () => {
    const root = note();
    const reply = note({
      id: 'n2',
      parentId: 'n1',
      content: 'Done in the next revision.',
      author: { id: 'u2', username: 'editor', displayName: 'Editor Name' },
      createdAt: '2026-11-05T10:05:00.000Z',
    });
    const resolved = note({
      id: 'n3',
      content: 'Old thread',
      resolvedAt: '2026-11-05T11:00:00.000Z',
      resolvedBy: { id: 'u1', username: 'admin', displayName: null },
    });
    const notes = state({
      notes: [root, reply, resolved],
      unresolvedCount: 1,
    });
    render(<NotesPanel postId="p1" state={notes} />);

    expect(screen.getByText('1 open / 3 total')).toBeDefined();
    expect(screen.getByText(/Only people who can edit this post/)).toBeDefined();
    expect(screen.getByText('Please tighten this paragraph.')).toBeDefined();
    expect(screen.getByText('Done in the next revision.')).toBeDefined();
    expect(screen.getByText('Editor Name')).toBeDefined();
    expect(screen.getByText(/Resolved by admin/)).toBeDefined();

    // Resolve the open thread, reopen the resolved one.
    fireEvent.click(screen.getAllByRole('button', { name: 'Resolve' })[0]!);
    expect(notes.setResolved).toHaveBeenCalledWith('n1', true);
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(notes.setResolved).toHaveBeenCalledWith('n3', false);

    // Reply to the open thread.
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    fireEvent.change(screen.getByLabelText('Write a reply'), {
      target: { value: 'Will do.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Post reply' }));
    expect(notes.reply).toHaveBeenCalledWith('n1', 'Will do.');
  });

  it('hides the reply action on resolved threads', () => {
    const notes = state({
      notes: [note({ resolvedAt: '2026-11-05T11:00:00.000Z' })],
    });
    render(<NotesPanel postId="p1" state={notes} />);
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeDefined();
  });

  it('surfaces a load error with the retry action available', () => {
    const notes = state({ error: 'Cannot reach the API. Check your connection and try again.' });
    render(<NotesPanel postId="p1" state={notes} />);
    expect(screen.getByRole('alert').textContent).toContain('Cannot reach the API');
  });

  it('attaches a note to the selected block and can make it general', async () => {
    const notes = state();
    const anchor = {
      name: 'core/paragraph',
      path: '1',
      hash: '0123456789abcdef',
      text: 'Tighten this paragraph.',
    };
    render(<NotesPanel postId="p1" state={notes} selectedAnchor={anchor} anchors={[]} />);

    expect(screen.getByText('Attached to')).toBeDefined();
    expect(screen.getByText('Paragraph · block 1')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Add a note'), {
      target: { value: 'Tighten this paragraph.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() => expect(notes.add).toHaveBeenCalledWith('Tighten this paragraph.', anchor));

    fireEvent.change(screen.getByLabelText('Add a note'), {
      target: { value: 'A general note.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Make general' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() => expect(notes.add).toHaveBeenCalledWith('A general note.', null));
  });

  it('shows exact, moved, changed and missing anchor states', () => {
    const exact = note({
      id: 'n1',
      block: {
        name: 'core/paragraph',
        path: '0',
        hash: '0123456789abcdef',
        text: 'First paragraph',
      },
    });
    const moved = note({
      id: 'n2',
      block: {
        name: 'core/paragraph',
        path: '0',
        hash: 'fedcba9876543210',
        text: 'Moved paragraph',
      },
    });
    const changed = note({
      id: 'n3',
      block: { name: 'core/heading', path: '2', hash: 'aaaaaaaaaaaaaaaa', text: 'Heading text' },
    });
    const missing = note({
      id: 'n4',
      block: { name: 'core/image', path: '5', hash: 'bbbbbbbbbbbbbbbb', text: 'Image' },
    });
    const anchors = [
      {
        name: 'core/paragraph',
        path: '0',
        hash: '0123456789abcdef',
        text: 'First paragraph',
        label: 'Paragraph',
      },
      {
        name: 'core/paragraph',
        path: '3',
        hash: 'fedcba9876543210',
        text: 'Moved paragraph',
        label: 'Paragraph',
      },
      {
        name: 'core/heading',
        path: '2',
        hash: 'cccccccccccccccc',
        text: 'Heading text edited',
        label: 'Heading',
      },
    ];
    render(
      <NotesPanel
        postId="p1"
        state={state({ notes: [exact, moved, changed, missing], unresolvedCount: 4 })}
        anchors={anchors}
      />,
    );

    expect(screen.getByText('Paragraph · block 0')).toBeDefined();
    expect(screen.getByText('Paragraph · block 3 (moved)')).toBeDefined();
    expect(screen.getByText('Heading · block 2 (block changed)')).toBeDefined();
    expect(screen.getByText('Block no longer found')).toBeDefined();
  });

  it('deletes an own thread and any reply with edit-any, after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const root = note({ author: { id: 'u1', username: 'admin', displayName: null } });
    const reply = note({
      id: 'n2',
      parentId: 'n1',
      content: 'A reply.',
      author: { id: 'u2', username: 'editor', displayName: null },
    });
    const notes = state({ notes: [root, reply], unresolvedCount: 1 });
    const { rerender } = render(
      <NotesPanel postId="p1" state={notes} currentUserId="u1" canDeleteAny={false} />,
    );

    // The author can delete their own thread, but not the editor's reply.
    expect(screen.getByRole('button', { name: 'Delete thread' })).toBeDefined();
    expect(screen.queryAllByRole('button', { name: 'Delete' })).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Delete thread' }));
    expect(confirm).toHaveBeenCalled();
    expect(notes.remove).toHaveBeenCalledWith('n1');

    rerender(<NotesPanel postId="p1" state={notes} currentUserId="u1" canDeleteAny />);
    const deletes = screen.getAllByRole('button', { name: 'Delete' });
    expect(deletes).toHaveLength(1);
    fireEvent.click(deletes[0]!);
    expect(notes.remove).toHaveBeenCalledWith('n2');
    confirm.mockRestore();
  });

  it('does not offer delete when the user cannot delete the note', () => {
    const notes = state({
      notes: [note({ author: { id: 'u2', username: 'editor', displayName: null } })],
    });
    render(<NotesPanel postId="p1" state={notes} currentUserId="u1" canDeleteAny={false} />);
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete thread' })).toBeNull();
  });

  it('cancels a delete when confirmation is declined', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const notes = state({
      notes: [note({ author: { id: 'u1', username: 'admin', displayName: null } })],
    });
    render(<NotesPanel postId="p1" state={notes} currentUserId="u1" canDeleteAny={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(notes.remove).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
