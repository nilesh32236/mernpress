'use client';

import { useState, type FormEvent } from 'react';

/**
 * WordPress-style password form for a protected post.
 *
 * The API withholds the body until the password is verified; a successful
 * unlock returns the sanitized HTML for this page only (no cookie, no stored
 * secret in the browser).
 */
export default function PasswordForm({ slug }: { slug: string }) {
  const [password, setPassword] = useState('');
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/posts/${encodeURIComponent(slug)}/unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.status === 429) {
        setError('Too many attempts. Please try again later.');
        return;
      }
      if (!response.ok) {
        setError(response.status === 403 ? 'Incorrect password.' : 'Could not unlock this post.');
        return;
      }
      const body = (await response.json()) as { renderedContent?: string };
      setContent(body.renderedContent ?? '');
      setPassword('');
    } catch {
      setError('Could not reach the site. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (content !== null) {
    return (
      <div
        className="entry-content post-password-content"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  return (
    <form className="post-password-form" onSubmit={(event) => void submit(event)}>
      <p>This content is password protected. To view it please enter your password below:</p>
      {error ? (
        <p className="post-password-error" role="alert">
          {error}
        </p>
      ) : null}
      <p>
        <label htmlFor="post-password">Password</label>
        <input
          id="post-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          disabled={busy}
        />
        <button type="submit" className="button primary-button" disabled={busy}>
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </p>
    </form>
  );
}
