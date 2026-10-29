import { useEffect, useState } from 'react';
import type { ContentType, PostStatus } from './api.js';

const ADMIN_BASE = '/admin';

export type Route =
  | { name: 'dashboard' }
  | { name: 'list'; type: ContentType }
  | { name: 'new'; type: ContentType }
  | { name: 'edit'; type: ContentType; id: string }
  | { name: 'terms' }
  | { name: 'notFound' };

export interface LocationState {
  pathname: string;
  search: string;
}

export const ROUTE_EVENT = 'mernpress:navigate';

function stripBase(pathname: string): string {
  return pathname.startsWith(`${ADMIN_BASE}/`)
    ? pathname.slice(ADMIN_BASE.length)
    : pathname === ADMIN_BASE
      ? '/'
      : pathname;
}

function fullPath(path: string): string {
  // In production the app is served under /admin; in dev it runs at root.
  // Only prefix when the browser is already under /admin.
  if (typeof window === 'undefined') return path;
  const underAdmin = window.location.pathname.startsWith(ADMIN_BASE);
  return underAdmin && path.startsWith('/') ? `${ADMIN_BASE}${path}` : path;
}

export function parseRoute(pathname: string): Route {
  const normalized = stripBase(pathname);
  const parts = normalized
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
  if (parts.length === 0) {
    return { name: 'dashboard' };
  }
  const [typeSegment, second, third] = parts;
  if (typeSegment === 'terms' && parts.length === 1) {
    return { name: 'terms' };
  }
  if (typeSegment !== 'posts' && typeSegment !== 'pages') {
    return { name: 'notFound' };
  }
  const type: ContentType = typeSegment === 'posts' ? 'post' : 'page';
  if (parts.length === 1) {
    return { name: 'list', type };
  }
  if (second === 'new' && parts.length === 2) {
    return { name: 'new', type };
  }
  if (second && third === 'edit' && parts.length === 3) {
    return { name: 'edit', type, id: decodeURIComponent(second) };
  }
  return { name: 'notFound' };
}

export function currentLocation(): LocationState {
  return { pathname: window.location.pathname, search: window.location.search };
}

export function navigate(to: string): void {
  const full = fullPath(to);
  if (`${window.location.pathname}${window.location.search}` === full) {
    return;
  }
  window.history.pushState(null, '', full);
  window.dispatchEvent(new Event(ROUTE_EVENT));
}

export function replace(to: string): void {
  const full = fullPath(to);
  window.history.replaceState(null, '', full);
  window.dispatchEvent(new Event(ROUTE_EVENT));
}

export function useLocation(): LocationState {
  const [location, setLocation] = useState<LocationState>(currentLocation);

  useEffect(() => {
    const update = () => setLocation(currentLocation());
    window.addEventListener('popstate', update);
    window.addEventListener(ROUTE_EVENT, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(ROUTE_EVENT, update);
    };
  }, []);

  return location;
}

export function listPath(
  type: ContentType,
  params: { status?: PostStatus | ''; search?: string; page?: number } = {},
): string {
  const base = type === 'post' ? '/posts' : '/pages';
  const search = new URLSearchParams();
  if (params.status) {
    search.set('status', params.status);
  }
  if (params.search) {
    search.set('search', params.search);
  }
  if (params.page && params.page > 1) {
    search.set('page', String(params.page));
  }
  const text = search.toString();
  return text ? `${base}?${text}` : base;
}

export function breadcrumbs(route: Route): Array<{ label: string; to?: string }> {
  switch (route.name) {
    case 'dashboard':
      return [{ label: 'Dashboard' }];
    case 'list':
      return [
        { label: 'Dashboard', to: '/' },
        { label: route.type === 'post' ? 'Posts' : 'Pages' },
      ];
    case 'new':
      return [
        { label: 'Dashboard', to: '/' },
        { label: route.type === 'post' ? 'Posts' : 'Pages', to: listPath(route.type) },
        { label: `New ${route.type}` },
      ];
    case 'edit':
      return [
        { label: 'Dashboard', to: '/' },
        { label: route.type === 'post' ? 'Posts' : 'Pages', to: listPath(route.type) },
        { label: 'Edit' },
      ];
    case 'terms':
      return [{ label: 'Dashboard', to: '/' }, { label: 'Categories & Tags' }];
    case 'notFound':
      return [{ label: 'Not found' }];
  }
}

export function newContentPath(type: ContentType): string {
  return type === 'post' ? '/posts/new' : '/pages/new';
}

export function editContentPath(type: ContentType, id: string): string {
  const base = type === 'post' ? '/posts' : '/pages';
  return `${base}/${encodeURIComponent(id)}/edit`;
}

export { ADMIN_BASE };
