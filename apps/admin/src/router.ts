import { useEffect, useState } from 'react';
import type { ContentType, PostStatus } from './api.js';

export type Route =
  | { name: 'dashboard' }
  | { name: 'list'; type: ContentType }
  | { name: 'new'; type: ContentType }
  | { name: 'edit'; type: ContentType; id: string }
  | { name: 'notFound' };

export interface LocationState {
  pathname: string;
  search: string;
}

export const ROUTE_EVENT = 'mernpress:navigate';

export function parseRoute(pathname: string): Route {
  const parts = pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
  if (parts.length === 0) {
    return { name: 'dashboard' };
  }
  const [typeSegment, second, third] = parts;
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
  if (`${window.location.pathname}${window.location.search}` === to) {
    return;
  }
  window.history.pushState(null, '', to);
  window.dispatchEvent(new Event(ROUTE_EVENT));
}

export function replace(to: string): void {
  window.history.replaceState(null, '', to);
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

export function newContentPath(type: ContentType): string {
  return type === 'post' ? '/posts/new' : '/pages/new';
}

export function editContentPath(type: ContentType, id: string): string {
  const base = type === 'post' ? '/posts' : '/pages';
  return `${base}/${encodeURIComponent(id)}/edit`;
}
