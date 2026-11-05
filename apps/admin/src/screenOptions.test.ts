import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCREEN_OPTIONS } from '@mernpress/contracts';
import {
  dashboardColumns,
  dashboardHiddenWidgets,
  editorHiddenPanels,
  flushScreenOptionsSync,
  hydrateScreenOptions,
  screenHiddenColumns,
  screenPerPage,
  screenViewMode,
  setDashboardColumns,
  setDashboardWidgetHidden,
  setEditorPanelHidden,
  setScreenColumnHidden,
  setScreenPerPage,
  setScreenViewMode,
} from './screenOptions.js';

beforeEach(() => {
  window.localStorage.clear();
  document.cookie = 'mernpress_csrf=test-csrf; path=/';
  hydrateScreenOptions({});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      return {
        ok: true,
        status: 200,
        json: async () => ({ options: body?.options ?? DEFAULT_SCREEN_OPTIONS }),
      } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.cookie = 'mernpress_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

describe('per-user screen options cache', () => {
  it('hydrates from the server map and reads every option family', () => {
    hydrateScreenOptions({
      perPage: { posts: 25 },
      hiddenColumns: { posts: ['author'] },
      viewMode: { posts: 'compact' },
      dashboardHidden: ['events'],
      dashboardColumns: 1,
      editorHiddenPanels: ['format'],
    });

    expect(screenPerPage('posts', 10)).toBe(25);
    expect(screenPerPage('pages', 10)).toBe(10);
    expect([...screenHiddenColumns('posts')]).toEqual(['author']);
    expect(screenViewMode('posts')).toBe('compact');
    expect(screenViewMode('pages')).toBe('extended');
    expect([...dashboardHiddenWidgets()]).toEqual(['events']);
    expect(dashboardColumns()).toBe(1);
    expect([...editorHiddenPanels()]).toEqual(['format']);
    expect(JSON.parse(window.localStorage.getItem('mernpress.screenOptions')!)).toMatchObject({
      perPage: { posts: 25 },
    });
  });

  it('updates the cache and syncs the whole map to the server', async () => {
    setScreenPerPage('posts', 50);
    setScreenColumnHidden('posts', 'date', true);
    setScreenViewMode('posts', 'compact');
    setDashboardWidgetHidden('quickDraft', true);
    setDashboardColumns(4);
    setEditorPanelHidden('author', true);

    expect(screenPerPage('posts', 10)).toBe(50);
    expect(screenHiddenColumns('posts').has('date')).toBe(true);
    expect(screenViewMode('posts')).toBe('compact');
    expect(dashboardHiddenWidgets().has('quickDraft')).toBe(true);
    expect(dashboardColumns()).toBe(4);
    expect(editorHiddenPanels().has('author')).toBe(true);

    await flushScreenOptionsSync();
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/profile/screen-options',
      expect.objectContaining({ method: 'PUT' }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(body.options).toMatchObject({
      perPage: { posts: 50 },
      hiddenColumns: { posts: ['date'] },
      viewMode: { posts: 'compact' },
      dashboardHidden: ['quickDraft'],
      dashboardColumns: 4,
      editorHiddenPanels: ['author'],
    });
  });

  it('migrates the legacy per-key localStorage layout once', async () => {
    window.localStorage.clear();
    window.localStorage.setItem('mernpress.perPage.posts', '30');
    window.localStorage.setItem('mernpress.hiddenColumns.posts', JSON.stringify(['tags']));
    window.localStorage.setItem('mernpress.viewMode.posts', 'compact');
    window.localStorage.setItem('mernpress.dashboardHidden', JSON.stringify(['glance']));
    window.localStorage.setItem('mernpress.dashboardColumns', '3');
    vi.resetModules();
    const fresh = await import('./screenOptions.js');
    expect(fresh.screenPerPage('posts', 10)).toBe(30);
    expect([...fresh.screenHiddenColumns('posts')]).toEqual(['tags']);
    expect(fresh.screenViewMode('posts')).toBe('compact');
    expect([...fresh.dashboardHiddenWidgets()]).toEqual(['glance']);
    expect(fresh.dashboardColumns()).toBe(3);
  });
});
