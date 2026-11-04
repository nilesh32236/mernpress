/**
 * Public site origin for the Site Editor / Customizer previews: the web dev
 * server locally, the same origin in production.
 */
export function publicSiteUrl(): string {
  const configured = import.meta.env.VITE_SITE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return import.meta.env.DEV ? 'http://127.0.0.1:3000' : '';
}

/** Absolute (same-origin or dev) URL for a public path. */
export function previewUrl(path: string): string {
  const base = publicSiteUrl();
  if (!base) return path.startsWith('/') ? path : `/${path}`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
