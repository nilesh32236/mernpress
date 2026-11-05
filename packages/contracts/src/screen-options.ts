/**
 * Per-user Screen Options.
 *
 * WordPress stores these as user meta: list-table columns, items per page,
 * view mode, dashboard boxes/columns and (for the classic editor) which panels
 * are visible. MERNPress stores the same shape on `users.screen_options` and
 * caches it locally so the admin can paint before the profile request returns.
 */
export const SCREEN_OPTION_SCREENS = [
  'posts',
  'pages',
  'users',
  'terms',
  'media',
  'comments',
  'plugins',
] as const;

export type ScreenOptionScreen = (typeof SCREEN_OPTION_SCREENS)[number];

export const DASHBOARD_WIDGET_IDS = [
  'welcome',
  'siteHealth',
  'glance',
  'activity',
  'quickDraft',
  'events',
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

/** Post-editor panels that can be hidden, mirroring the classic editor's Screen Options. */
export const EDITOR_PANELS = [
  { id: 'author', label: 'Author' },
  { id: 'template', label: 'Template' },
  { id: 'discussion', label: 'Discussion' },
  { id: 'format', label: 'Format' },
  { id: 'slug', label: 'Slug' },
  { id: 'categoriesTags', label: 'Categories and tags' },
  { id: 'sticky', label: 'Sticky' },
] as const;

export type EditorPanelId = (typeof EDITOR_PANELS)[number]['id'];

export type ScreenViewMode = 'compact' | 'extended';
export type DashboardColumns = 1 | 2 | 3 | 4;

export interface ScreenOptionsState {
  perPage: Partial<Record<ScreenOptionScreen, number>>;
  hiddenColumns: Partial<Record<ScreenOptionScreen, string[]>>;
  viewMode: Partial<Record<ScreenOptionScreen, ScreenViewMode>>;
  dashboardHidden: DashboardWidgetId[];
  dashboardColumns: DashboardColumns;
  editorHiddenPanels: EditorPanelId[];
}

export const DEFAULT_SCREEN_OPTIONS: ScreenOptionsState = {
  perPage: {},
  hiddenColumns: {},
  viewMode: {},
  dashboardHidden: [],
  dashboardColumns: 2,
  editorHiddenPanels: [],
};

const SCREEN_SET = new Set<string>(SCREEN_OPTION_SCREENS);
const WIDGET_SET = new Set<string>(DASHBOARD_WIDGET_IDS);
const PANEL_SET = new Set<string>(EDITOR_PANELS.map((panel) => panel.id));
const COLUMN_ID = /^[a-z][a-z0-9-]{0,39}$/i;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function intOr(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

/**
 * Coerce untrusted storage into the current shape. Unknown screens, columns and
 * panels are dropped instead of failing: stale preferences must never lock a
 * user out of the admin.
 */
export function normalizeScreenOptions(value: unknown): ScreenOptionsState {
  const input = object(value);
  if (!input) return { ...DEFAULT_SCREEN_OPTIONS };

  const perPage: Partial<Record<ScreenOptionScreen, number>> = {};
  const perPageInput = object(input['perPage']);
  if (perPageInput) {
    for (const [screen, raw] of Object.entries(perPageInput)) {
      if (!SCREEN_SET.has(screen)) continue;
      const number = intOr(raw, 1, 100, 0);
      if (number > 0) perPage[screen as ScreenOptionScreen] = number;
    }
  }

  const hiddenColumns: Partial<Record<ScreenOptionScreen, string[]>> = {};
  const columnsInput = object(input['hiddenColumns']);
  if (columnsInput) {
    for (const [screen, raw] of Object.entries(columnsInput)) {
      if (!SCREEN_SET.has(screen) || !Array.isArray(raw)) continue;
      const columns = [
        ...new Set(
          raw.filter(
            (column): column is string => typeof column === 'string' && COLUMN_ID.test(column),
          ),
        ),
      ].slice(0, 30);
      if (columns.length > 0) hiddenColumns[screen as ScreenOptionScreen] = columns;
    }
  }

  const viewMode: Partial<Record<ScreenOptionScreen, ScreenViewMode>> = {};
  const viewInput = object(input['viewMode']);
  if (viewInput) {
    for (const [screen, raw] of Object.entries(viewInput)) {
      if (!SCREEN_SET.has(screen)) continue;
      if (raw === 'compact' || raw === 'extended') {
        viewMode[screen as ScreenOptionScreen] = raw;
      }
    }
  }

  const dashboardHidden = Array.isArray(input['dashboardHidden'])
    ? [
        ...new Set(
          input['dashboardHidden'].filter(
            (id): id is DashboardWidgetId => typeof id === 'string' && WIDGET_SET.has(id),
          ),
        ),
      ]
    : [];

  const editorHiddenPanels = Array.isArray(input['editorHiddenPanels'])
    ? [
        ...new Set(
          input['editorHiddenPanels'].filter(
            (id): id is EditorPanelId => typeof id === 'string' && PANEL_SET.has(id),
          ),
        ),
      ]
    : [];

  return {
    perPage,
    hiddenColumns,
    viewMode,
    dashboardHidden,
    dashboardColumns: intOr(input['dashboardColumns'], 1, 4, 2) as DashboardColumns,
    editorHiddenPanels,
  };
}
