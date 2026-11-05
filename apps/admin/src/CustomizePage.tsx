import { useEffect, useState, type FormEvent } from 'react';
import {
  actionErrorMessage,
  fetchCustomizer,
  fetchOptions,
  fetchPosts,
  fetchThemes,
  updateCustomizer,
  updateOptions,
  type AdminPost,
  type AdminTheme,
  type CustomizerColors,
  type CustomizerMenuItem,
  type CustomizerSettings,
} from './api.js';
import { Notice, Skeleton, type NoticeMessage } from './components.js';
import { navigate } from './router.js';
import { publicSiteUrl } from './sitePreview.js';

type Section = 'identity' | 'colors' | 'menus' | 'homepage' | 'css';

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'identity', label: 'Site Identity' },
  { id: 'colors', label: 'Colors' },
  { id: 'menus', label: 'Menus' },
  { id: 'homepage', label: 'Homepage Settings' },
  { id: 'css', label: 'Additional CSS' },
];

const COLOR_KEYS = ['background', 'surface', 'text', 'muted', 'accent'] as const;
type ColorKey = (typeof COLOR_KEYS)[number];
const EMPTY_COLORS: Record<ColorKey, string> = {
  background: '',
  surface: '',
  text: '',
  muted: '',
  accent: '',
};
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const MENU_MAX = 20;

function colorsFrom(colors: CustomizerColors | null): Record<ColorKey, string> {
  return {
    background: colors?.background ?? '',
    surface: colors?.surface ?? '',
    text: colors?.text ?? '',
    muted: colors?.muted ?? '',
    accent: colors?.accent ?? '',
  };
}

/**
 * Appearance → Customize.
 *
 * Mirrors the WordPress Customizer panels this build can actually honour:
 * Site Identity (General options), Colors (theme-token overrides), Menus
 * (label/URL items used by the header), Homepage Settings (latest posts or a
 * static page + posts page) and Additional CSS (validated, sanitized server-
 * side). Template editing stays in the Site Editor and is not faked here.
 */
export function CustomizePage() {
  const [section, setSection] = useState<Section>('identity');
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [customizer, setCustomizer] = useState<CustomizerSettings | null>(null);
  const [colors, setColors] = useState<Record<ColorKey, string>>(EMPTY_COLORS);
  const [menu, setMenu] = useState<CustomizerMenuItem[]>([]);
  const [showOnFront, setShowOnFront] = useState<'posts' | 'page'>('posts');
  const [pageOnFront, setPageOnFront] = useState('');
  const [pageForPosts, setPageForPosts] = useState('');
  const [css, setCss] = useState('');
  const [pages, setPages] = useState<AdminPost[]>([]);
  const [theme, setTheme] = useState<AdminTheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [identityDirty, setIdentityDirty] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const previewUrl = publicSiteUrl();

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchOptions('general'),
      fetchCustomizer(),
      fetchPosts({ type: 'page', status: 'PUBLISHED', perPage: 100 }),
      fetchThemes().catch(() => null),
    ])
      .then(([values, settings, pageList, themes]) => {
        if (!active) return;
        setTitle(typeof values.site_title === 'string' ? values.site_title : '');
        setTagline(typeof values.site_tagline === 'string' ? values.site_tagline : '');
        setCustomizer(settings);
        setColors(colorsFrom(settings.colors));
        setMenu(settings.menu ?? []);
        setShowOnFront(settings.showOnFront);
        setPageOnFront(settings.pageOnFront ?? '');
        setPageForPosts(settings.pageForPosts ?? '');
        setCss(settings.css ?? '');
        setPages(pageList.items.filter((page) => page.status !== 'TRASHED'));
        setTheme(themes?.themes.find((entry) => entry.active) ?? null);
      })
      .catch((caught) => {
        if (active) setError(actionErrorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await updateOptions('general', { site_title: title, site_tagline: tagline });
      setIdentityDirty(false);
      setPreviewKey((value) => value + 1);
      setNotice({ tone: 'success', text: 'Site identity saved.' });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  function applyCustomizer(next: CustomizerSettings): void {
    setCustomizer(next);
    setColors(colorsFrom(next.colors));
    setMenu(next.menu ?? []);
    setShowOnFront(next.showOnFront);
    setPageOnFront(next.pageOnFront ?? '');
    setPageForPosts(next.pageForPosts ?? '');
    setCss(next.css ?? '');
    setDirty(false);
  }

  function buildPayload(): CustomizerSettings | null {
    const nextColors: CustomizerColors = {};
    for (const key of COLOR_KEYS) {
      const value = colors[key].trim();
      if (!value) continue;
      if (!HEX_COLOR.test(value)) {
        setError('Colors must be hex values such as #1d2327.');
        return null;
      }
      nextColors[key] = value;
    }
    const menuItems: CustomizerMenuItem[] = [];
    for (const item of menu) {
      const label = item.label.trim();
      const url = item.url.trim();
      if (!label && !url) continue;
      if (!label || !url) {
        setError('Each menu item needs both a label and a URL.');
        return null;
      }
      menuItems.push({ label, url });
    }
    if (showOnFront === 'page' && !pageOnFront) {
      setError('Choose a homepage or switch back to latest posts.');
      return null;
    }
    if (showOnFront === 'page' && pageOnFront && pageOnFront === pageForPosts) {
      setError('The homepage and posts page must be different.');
      return null;
    }
    return {
      colors: Object.keys(nextColors).length > 0 ? nextColors : null,
      menu: menuItems.length > 0 ? menuItems : null,
      css: css.trim().length > 0 ? css : null,
      showOnFront,
      pageOnFront: showOnFront === 'page' ? pageOnFront || null : null,
      pageForPosts: showOnFront === 'page' ? pageForPosts || null : null,
    };
  }

  async function saveCustomizer(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setNotice(null);
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    try {
      const next = await updateCustomizer(payload);
      applyCustomizer(next);
      setPreviewKey((value) => value + 1);
      setNotice({ tone: 'success', text: `${labelFor(section)} saved.` });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  function moveMenu(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= menu.length) return;
    const next = [...menu];
    const [item] = next.splice(index, 1);
    if (item) next.splice(target, 0, item);
    setMenu(next);
    setDirty(true);
  }

  if (loading) {
    return (
      <div className="customize-screen">
        <Skeleton label="Loading the Customizer…" lines={6} />
      </div>
    );
  }

  const themeColors = theme?.tokens ?? null;

  return (
    <div className="customize-screen">
      <header className="customize-header">
        <h1>Customizing: MERNPress</h1>
        <div className="customize-header-actions">
          <button
            type="button"
            className="button secondary-button"
            onClick={() => setPreviewKey((value) => value + 1)}
          >
            Refresh preview
          </button>
          <button
            type="button"
            className="customize-close"
            aria-label="Close the Customizer"
            onClick={() => navigate('/themes')}
          >
            ×
          </button>
        </div>
      </header>

      <div className="customize-body">
        <aside className="customize-panel" aria-label="Customizer controls">
          <nav className="customize-sections" aria-label="Customizer sections">
            {SECTIONS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`customize-section-link${section === entry.id ? ' is-active' : ''}`}
                aria-current={section === entry.id ? 'page' : undefined}
                onClick={() => {
                  setSection(entry.id);
                  setNotice(null);
                  setError(null);
                }}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          <h2>{labelFor(section)}</h2>
          {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          {section === 'identity' ? (
            <form onSubmit={(event) => void saveIdentity(event)} aria-label="Site identity">
              <div className="field">
                <label htmlFor="customize-site-title">Site Title</label>
                <input
                  id="customize-site-title"
                  type="text"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setIdentityDirty(true);
                  }}
                  disabled={saving}
                />
              </div>
              <div className="field">
                <label htmlFor="customize-site-tagline">Tagline</label>
                <input
                  id="customize-site-tagline"
                  type="text"
                  value={tagline}
                  onChange={(event) => {
                    setTagline(event.target.value);
                    setIdentityDirty(true);
                  }}
                  disabled={saving}
                />
                <p className="field-help">In a few words, explain what this site is about.</p>
              </div>
              <div className="customize-actions">
                <button
                  type="submit"
                  className="button primary-button"
                  disabled={saving || !identityDirty}
                >
                  {saving ? 'Saving…' : 'Save & Publish'}
                </button>
              </div>
            </form>
          ) : null}

          {section === 'colors' ? (
            <form onSubmit={(event) => void saveCustomizer(event)} aria-label="Colors">
              <p className="field-help">
                Override the active theme&rsquo;s colour tokens. Leave a field empty to use the
                theme value.
              </p>
              {COLOR_KEYS.map((key) => (
                <div className="field" key={key}>
                  <label htmlFor={`customize-color-${key}`}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </label>
                  <input
                    id={`customize-color-${key}`}
                    type="text"
                    value={colors[key]}
                    placeholder={themeColors ? themeColors[key] : 'Theme default'}
                    onChange={(event) => {
                      setColors((current) => ({ ...current, [key]: event.target.value }));
                      setDirty(true);
                    }}
                    disabled={saving}
                  />
                </div>
              ))}
              <div className="customize-actions">
                <button
                  type="button"
                  className="button secondary-button"
                  onClick={() => {
                    setColors({ ...EMPTY_COLORS });
                    setDirty(true);
                  }}
                  disabled={saving}
                >
                  Use theme colours
                </button>
                <button type="submit" className="button primary-button" disabled={saving || !dirty}>
                  {saving ? 'Saving…' : 'Save & Publish'}
                </button>
              </div>
            </form>
          ) : null}

          {section === 'menus' ? (
            <form onSubmit={(event) => void saveCustomizer(event)} aria-label="Menus">
              <p className="field-help">
                Links for the header navigation. With no items, the theme lists your published
                pages. Up to {MENU_MAX} items.
              </p>
              {menu.length === 0 ? (
                <p className="customize-empty">
                  No custom menu yet — the header shows your published pages.
                </p>
              ) : (
                <ol className="customize-menu-list">
                  {menu.map((item, index) => (
                    <li key={index} className="customize-menu-item">
                      <label>
                        <span>Label</span>
                        <input
                          type="text"
                          value={item.label}
                          maxLength={80}
                          onChange={(event) => {
                            const next = [...menu];
                            next[index] = { ...item, label: event.target.value };
                            setMenu(next);
                            setDirty(true);
                          }}
                          disabled={saving}
                        />
                      </label>
                      <label>
                        <span>URL</span>
                        <input
                          type="text"
                          value={item.url}
                          maxLength={2048}
                          placeholder="/about"
                          onChange={(event) => {
                            const next = [...menu];
                            next[index] = { ...item, url: event.target.value };
                            setMenu(next);
                            setDirty(true);
                          }}
                          disabled={saving}
                        />
                      </label>
                      <div className="customize-menu-actions">
                        <button
                          type="button"
                          className="button secondary-button"
                          onClick={() => moveMenu(index, -1)}
                          disabled={saving || index === 0}
                          aria-label={`Move ${item.label || 'item'} up`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="button secondary-button"
                          onClick={() => moveMenu(index, 1)}
                          disabled={saving || index === menu.length - 1}
                          aria-label={`Move ${item.label || 'item'} down`}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="button secondary-button"
                          onClick={() => {
                            setMenu(menu.filter((_, position) => position !== index));
                            setDirty(true);
                          }}
                          disabled={saving}
                          aria-label={`Remove ${item.label || 'item'}`}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <div className="customize-actions">
                <button
                  type="button"
                  className="button secondary-button"
                  onClick={() => {
                    if (menu.length >= MENU_MAX) return;
                    setMenu([...menu, { label: '', url: '' }]);
                    setDirty(true);
                  }}
                  disabled={saving || menu.length >= MENU_MAX}
                >
                  Add menu item
                </button>
                <button
                  type="button"
                  className="button secondary-button"
                  onClick={() => {
                    setMenu([]);
                    setDirty(true);
                  }}
                  disabled={saving || menu.length === 0}
                >
                  Use page links
                </button>
                <button type="submit" className="button primary-button" disabled={saving || !dirty}>
                  {saving ? 'Saving…' : 'Save & Publish'}
                </button>
              </div>
            </form>
          ) : null}

          {section === 'homepage' ? (
            <form onSubmit={(event) => void saveCustomizer(event)} aria-label="Homepage settings">
              <p className="field-help">Choose what the front page shows.</p>
              <label className="checkbox-row">
                <input
                  type="radio"
                  name="show_on_front"
                  value="posts"
                  checked={showOnFront === 'posts'}
                  onChange={() => {
                    setShowOnFront('posts');
                    setDirty(true);
                  }}
                  disabled={saving}
                />
                <span>Your latest posts</span>
              </label>
              <label className="checkbox-row">
                <input
                  type="radio"
                  name="show_on_front"
                  value="page"
                  checked={showOnFront === 'page'}
                  onChange={() => {
                    setShowOnFront('page');
                    setDirty(true);
                  }}
                  disabled={saving}
                />
                <span>A static page</span>
              </label>
              <div className="field">
                <label htmlFor="page_on_front">Homepage</label>
                <select
                  id="page_on_front"
                  value={pageOnFront}
                  onChange={(event) => {
                    setPageOnFront(event.target.value);
                    setDirty(true);
                  }}
                  disabled={saving || showOnFront !== 'page'}
                >
                  <option value="">— Select —</option>
                  {pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="page_for_posts">Posts page</label>
                <select
                  id="page_for_posts"
                  value={pageForPosts}
                  onChange={(event) => {
                    setPageForPosts(event.target.value);
                    setDirty(true);
                  }}
                  disabled={saving || showOnFront !== 'page'}
                >
                  <option value="">— Select —</option>
                  {pages
                    .filter((page) => page.id !== pageOnFront)
                    .map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.title}
                      </option>
                    ))}
                </select>
                <p className="field-help">
                  The selected page shows the blog instead of its own content.
                </p>
              </div>
              <div className="customize-actions">
                <button type="submit" className="button primary-button" disabled={saving || !dirty}>
                  {saving ? 'Saving…' : 'Save & Publish'}
                </button>
              </div>
            </form>
          ) : null}

          {section === 'css' ? (
            <form onSubmit={(event) => void saveCustomizer(event)} aria-label="Additional CSS">
              <p className="field-help">
                CSS is validated before it is stored: constructs that could escape the style
                element, execute script or import remote resources are rejected.
              </p>
              <div className="field">
                <label htmlFor="customize-css">Additional CSS</label>
                <textarea
                  id="customize-css"
                  className="customize-css-input"
                  rows={14}
                  value={css}
                  onChange={(event) => {
                    setCss(event.target.value);
                    setDirty(true);
                  }}
                  disabled={saving}
                  spellCheck={false}
                />
                <p className="field-help">{css.length} / 20000 characters</p>
              </div>
              <div className="customize-actions">
                <button type="submit" className="button primary-button" disabled={saving || !dirty}>
                  {saving ? 'Saving…' : 'Save & Publish'}
                </button>
              </div>
            </form>
          ) : null}

          {customizer ? (
            <p className="customize-footnote">
              Changes apply to every page through theme tokens, the header menu and the injected
              stylesheet.
            </p>
          ) : null}
        </aside>

        <div className="customize-preview">
          <iframe
            key={previewKey}
            title="Site preview"
            src={previewUrl}
            className="customize-preview-frame"
          />
        </div>
      </div>
    </div>
  );
}

function labelFor(section: Section): string {
  return SECTIONS.find((entry) => entry.id === section)?.label ?? 'Customize';
}
