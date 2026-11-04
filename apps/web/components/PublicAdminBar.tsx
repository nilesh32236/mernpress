'use client';

import { useEffect, useState } from 'react';

interface SessionUser {
  id: string;
  username: string;
  role: string;
}

/**
 * WordPress-style admin bar for signed-in users on the public site.
 * The session probe is same-origin, so it works in production where the admin
 * and public site share the domain; in local development the probe simply
 * fails and the bar stays hidden.
 */
export default function PublicAdminBar({ siteTitle }: { siteTitle: string }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [enabled, setEnabled] = useState(true);

  // The same-origin session probe only exists in production (where /api and
  // the public site share a domain). In development the admin runs on a
  // different port, so keep the bar hidden and avoid a stray 404 request.
  const isProduction = process.env.NODE_ENV === 'production';

  useEffect(() => {
    if (!isProduction) return;
    try {
      setEnabled(window.localStorage.getItem('mernpress.toolbar') !== '0');
    } catch {
      // Storage is optional.
    }

    let active = true;
    fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { user?: SessionUser } | null) => {
        if (active && body?.user) setUser(body.user);
      })
      .catch(() => {
        // Anonymous visitors have no bar.
      });

    return () => {
      active = false;
    };
  }, [isProduction]);

  useEffect(() => {
    const visible = Boolean(user) && enabled && isProduction;
    document.documentElement.classList.toggle('has-public-admin-bar', visible);
    return () => document.documentElement.classList.remove('has-public-admin-bar');
  }, [user, enabled, isProduction]);

  async function signOut() {
    try {
      const csrf = await (
        await fetch('/api/auth/csrf', { credentials: 'include', cache: 'no-store' })
      ).json();
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': csrf.csrfToken },
      });
    } catch {
      // Fall through to the admin sign-out screen.
    }
    window.location.href = '/';
  }

  if (!isProduction || !user || !enabled) return null;

  return (
    <div className="public-admin-bar" role="navigation" aria-label="Admin bar">
      <a className="public-admin-site" href="/admin/">
        {siteTitle}
      </a>
      <details className="public-admin-new">
        <summary>+ New</summary>
        <div className="public-admin-menu">
          <a href="/admin/posts/new">Post</a>
          <a href="/admin/media?upload=1">Media</a>
          <a href="/admin/pages/new">Page</a>
          {user.role === 'administrator' ? <a href="/admin/users?action=add">User</a> : null}
        </div>
      </details>
      <div className="public-admin-right">
        <a href="/admin/profile">Howdy, {user.username}</a>
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
