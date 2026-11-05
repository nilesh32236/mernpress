import { describe, expect, it } from 'vitest';
import { shouldTrackView } from '../components/ViewTracker.js';

describe('privacy-first view beacon', () => {
  it('tracks public paths and honours Do-Not-Track', () => {
    expect(shouldTrackView('/posts/hello', null)).toBe(true);
    expect(shouldTrackView('/', undefined)).toBe(true);
    expect(shouldTrackView('/posts/hello', '1')).toBe(false);
    expect(shouldTrackView('/posts/hello', 'yes')).toBe(false);
  });

  it('never tracks admin, API or non-path values', () => {
    expect(shouldTrackView('/admin', null)).toBe(false);
    expect(shouldTrackView('/admin/settings', null)).toBe(false);
    expect(shouldTrackView('/api/public/site', null)).toBe(false);
    expect(shouldTrackView('https://example.com/', null)).toBe(false);
  });
});
