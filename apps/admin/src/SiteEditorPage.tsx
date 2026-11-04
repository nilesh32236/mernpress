import { useEffect, useState } from 'react';
import { fetchOptions, type AuthUser } from './api.js';
import { previewUrl } from './sitePreview.js';
import { navigate } from './router.js';

interface TemplateEntry {
  id: string;
  label: string;
  /** Path resolved from real content; null until loaded or when unavailable. */
  path: string | null;
  hint?: string | undefined;
}

interface SampleContent {
  post: string | null;
  page: string | null;
  category: string | null;
  tag: string | null;
  base: string;
}

function defaultSamples(): SampleContent {
  return { post: null, page: null, category: null, tag: null, base: 'posts' };
}

function templateList(samples: SampleContent): TemplateEntry[] {
  const post = samples.post;
  return [
    { id: 'home', label: 'Front Page', path: '/' },
    { id: 'blog', label: 'Blog Index', path: '/posts' },
    {
      id: 'single',
      label: 'Single Post',
      path: post,
      hint: post ? undefined : 'No published post yet.',
    },
    {
      id: 'page',
      label: 'Page',
      path: samples.page,
      hint: samples.page ? undefined : 'No published page yet.',
    },
    {
      id: 'category',
      label: 'Category Archive',
      path: samples.category,
      hint: samples.category ? undefined : 'No category archive yet.',
    },
    {
      id: 'tag',
      label: 'Tag Archive',
      path: samples.tag,
      hint: samples.tag ? undefined : 'No tag archive yet.',
    },
    { id: 'search', label: 'Search Results', path: '/search?q=' },
    { id: 'notFound', label: '404 Page', path: '/nope' },
  ];
}

/**
 * Appearance → Editor (Site Editor).
 *
 * WordPress edits block templates here. MERNPress's theme templates live in
 * code (`apps/web/app`), so this screen presents the real template list with a
 * live preview of each page, links the implemented design panels, and states
 * plainly that in-browser template editing is not enabled.
 */
export function SiteEditorPage({ user }: { user: AuthUser }) {
  const [samples, setSamples] = useState<SampleContent>(defaultSamples);
  const [selected, setSelected] = useState<string>('home');
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const next = defaultSamples();
      try {
        const settings = await fetchOptions('permalinks').catch(() => null);
        const configured =
          typeof settings?.permalink_base === 'string' ? settings.permalink_base : '';
        const posts = await fetch('/api/public/posts?type=post&perPage=1&page=1').then(
          (response) => (response.ok ? response.json() : null),
        );
        const pages = await fetch('/api/public/posts?type=page&perPage=1&page=1').then(
          (response) => (response.ok ? response.json() : null),
        );
        const postItem = posts?.items?.[0];
        const pageItem = pages?.items?.[0];
        next.base = configured || 'posts';
        if (postItem) {
          next.post = `/${next.base}/${postItem.slug}`;
          next.category = postItem.terms?.categories?.[0]
            ? `/category/${postItem.terms.categories[0].slug}`
            : null;
          next.tag = postItem.terms?.tags?.[0] ? `/tag/${postItem.terms.tags[0].slug}` : null;
        }
        if (pageItem) next.page = `/${pageItem.slug}`;
      } catch {
        // Templates still preview the static routes.
      }
      if (active) {
        setSamples(next);
        setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const templates = templateList(samples);
  const current = templates.find((template) => template.id === selected) ?? templates[0]!;
  const src = current.path ? previewUrl(current.path) : null;

  function unavailable(label: string) {
    setNotice(
      `${label} is not available in this build. MERNPress's theme templates and styles are defined in code and ship with releases.`,
    );
  }

  return (
    <div className="site-editor">
      <aside className="site-editor-sidebar" aria-label="Design">
        <div className="site-editor-heading">
          <button
            type="button"
            className="site-editor-back"
            aria-label="Back to themes"
            onClick={() => navigate('/themes')}
          >
            ‹
          </button>
          <div>
            <h1>Design</h1>
            <p>Customize the appearance of your website using the block editor.</p>
          </div>
        </div>

        <nav className="site-editor-nav">
          <button type="button" onClick={() => navigate('/themes/customize')}>
            <span className="site-editor-nav-icon" aria-hidden="true">
              ◯
            </span>
            Identity
          </button>
          <button type="button" onClick={() => unavailable('Styles')}>
            <span className="site-editor-nav-icon" aria-hidden="true">
              ◐
            </span>
            Styles
          </button>
          <button type="button" onClick={() => navigate('/pages')}>
            <span className="site-editor-nav-icon" aria-hidden="true">
              ▤
            </span>
            Pages
          </button>
          <button type="button" onClick={() => unavailable('Navigation')}>
            <span className="site-editor-nav-icon" aria-hidden="true">
              ↗
            </span>
            Navigation
          </button>
          <button type="button" onClick={() => unavailable('Patterns')}>
            <span className="site-editor-nav-icon" aria-hidden="true">
              ◇
            </span>
            Patterns
          </button>
          <div className="site-editor-templates">
            <div className="site-editor-nav-label">
              <span className="site-editor-nav-icon" aria-hidden="true">
                ▥
              </span>
              Templates
            </div>
            <ul>
              {templates.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    className={template.id === selected ? 'is-current' : undefined}
                    onClick={() => {
                      setSelected(template.id);
                      setNotice(null);
                    }}
                    title={template.hint}
                  >
                    {template.label}
                    {template.path === null ? (
                      <span className="site-editor-template-hint">unavailable</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <p className="site-editor-saved">{loading ? 'Loading templates…' : 'Saved'}</p>
      </aside>

      <section className="site-editor-canvas" aria-label="Template preview">
        {notice ? (
          <div className="notice notice-info site-editor-notice" role="status">
            <p>{notice}</p>
          </div>
        ) : null}
        <div className="site-editor-frame">
          {src ? (
            <iframe key={src} title={`${current.label} preview`} src={src} />
          ) : (
            <div className="site-editor-empty">
              <p>{current.hint ?? 'This template has no content to preview yet.'}</p>
              {user.role === 'administrator' ? (
                <button
                  type="button"
                  className="button primary-button"
                  onClick={() => navigate('/posts/new')}
                >
                  Create content
                </button>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
