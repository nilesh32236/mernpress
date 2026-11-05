import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { fetchNoteMentionCandidates, type NoteMentionCandidate } from '../api.js';

/**
 * Note textarea with an @mention picker.
 *
 * Typing `@query` asks the API for active users who can edit this post, shows a
 * listbox and lets the author pick with the mouse or Arrow Up/Down + Enter.
 * The server remains authoritative; the picker only mirrors its candidates.
 */
export function MentionTextarea({
  id,
  postId,
  value,
  onChange,
  rows = 3,
  placeholder,
  disabled = false,
}: {
  id: string;
  postId: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [items, setItems] = useState<NoteMentionCandidate[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!mention) {
      setOpen(false);
      setItems([]);
      setLoading(false);
      return;
    }
    const id = requestId.current + 1;
    requestId.current = id;
    setLoading(true);
    setOpen(true);
    const timer = window.setTimeout(() => {
      fetchNoteMentionCandidates(postId, mention.query)
        .then((next) => {
          if (requestId.current !== id) return;
          setItems(next);
          setActive(0);
        })
        .catch(() => {
          if (requestId.current !== id) return;
          setItems([]);
        })
        .finally(() => {
          if (requestId.current === id) setLoading(false);
        });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [mention?.query, mention, postId]);

  function detectMention(element: HTMLTextAreaElement): void {
    const caret = element.selectionStart ?? element.value.length;
    const before = element.value.slice(0, caret);
    const match = /(?:^|\s)@([a-z0-9._-]{0,31})$/i.exec(before);
    if (!match) {
      setMention(null);
      return;
    }
    const query = match[1] ?? '';
    setMention({ start: caret - query.length - 1, query });
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    onChange(event.target.value);
    detectMention(event.target);
  }

  function choose(candidate: NoteMentionCandidate): void {
    if (!mention) return;
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? value.length;
    const next = `${value.slice(0, mention.start)}@${candidate.username} ${value.slice(caret)}`;
    onChange(next);
    setMention(null);
    setOpen(false);
    window.setTimeout(() => {
      const position = mention.start + candidate.username.length + 2;
      textarea?.focus();
      textarea?.setSelectionRange(position, position);
    }, 0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Escape') {
      if (open) event.preventDefault();
      setMention(null);
      setOpen(false);
      return;
    }
    if (!open || items.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (current + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const candidate = items[active];
      if (candidate) choose(candidate);
    }
  }

  return (
    <div className="mention-textarea">
      <textarea
        ref={textareaRef}
        id={id}
        rows={rows}
        value={value}
        maxLength={2000}
        placeholder={placeholder}
        disabled={disabled}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(event) => detectMention(event.currentTarget)}
        aria-autocomplete="list"
        aria-controls={open ? `${id}-mention-list` : undefined}
        aria-activedescendant={
          open && items[active] ? `${id}-mention-option-${items[active]!.id}` : undefined
        }
      />
      {open ? (
        <div className="mention-suggestions">
          <ul id={`${id}-mention-list`} role="listbox" aria-label="Mention suggestions">
            {loading && items.length === 0 ? (
              <li className="mention-empty">Searching…</li>
            ) : items.length === 0 ? (
              <li className="mention-empty">No matching editors.</li>
            ) : (
              items.map((candidate, index) => (
                <li
                  key={candidate.id}
                  id={`${id}-mention-option-${candidate.id}`}
                  role="option"
                  aria-selected={index === active}
                  className={index === active ? 'is-active' : undefined}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(candidate);
                  }}
                >
                  <strong>{candidate.displayName?.trim() || candidate.username}</strong>
                  <span>@{candidate.username}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
