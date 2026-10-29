import { useEffect, useState, type FormEvent } from 'react';
import {
  actionErrorMessage,
  fetchOptions,
  updateOptions,
  type AuthUser,
  type OptionGroup,
  type OptionValues,
} from './api.js';
import { ErrorState, Notice, PageHeader, Skeleton, type NoticeMessage } from './components.js';

type SettingsTab = OptionGroup;

const TABS: Array<{ value: SettingsTab; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'reading', label: 'Reading' },
  { value: 'writing', label: 'Writing' },
];

function textValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function toMessage(error: unknown): string {
  let fromHelper: unknown;
  if (typeof actionErrorMessage === 'function') {
    try {
      fromHelper = actionErrorMessage(error);
    } catch {
      fromHelper = undefined;
    }
  }
  if (typeof fromHelper === 'string' && fromHelper.length > 0) {
    return fromHelper;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Cannot reach the API. Check your connection and try again.';
}

export function SettingsPage({ user: _user }: { user: AuthUser }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const [loaded, setLoaded] = useState<Record<OptionGroup, boolean>>({
    general: false,
    reading: false,
    writing: false,
  });
  const [loading, setLoading] = useState<Record<OptionGroup, boolean>>({
    general: false,
    reading: false,
    writing: false,
  });
  const [errors, setErrors] = useState<Record<OptionGroup, string | null>>({
    general: null,
    reading: null,
    writing: null,
  });
  const [saving, setSaving] = useState<Record<OptionGroup, boolean>>({
    general: false,
    reading: false,
    writing: false,
  });

  const [notice, setNotice] = useState<NoticeMessage | null>(null);

  const [siteTitle, setSiteTitle] = useState('');
  const [siteTagline, setSiteTagline] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [generalDirty, setGeneralDirty] = useState(false);

  const [homepageMode, setHomepageMode] = useState<'latest_posts' | 'static_page'>('latest_posts');
  const [homepageId, setHomepageId] = useState('');
  const [postsPageId, setPostsPageId] = useState('');
  const [postsPerPage, setPostsPerPage] = useState('10');
  const [readingDirty, setReadingDirty] = useState(false);

  const [defaultCategory, setDefaultCategory] = useState('');
  const [defaultAuthor, setDefaultAuthor] = useState('');
  const [writingDirty, setWritingDirty] = useState(false);

  async function loadGroup(group: OptionGroup) {
    setLoading((prev) => ({ ...prev, [group]: true }));
    setErrors((prev) => ({ ...prev, [group]: null }));
    try {
      const values: OptionValues = await fetchOptions(group);
      if (group === 'general') {
        setSiteTitle(textValue(values.site_title));
        setSiteTagline(textValue(values.site_tagline));
        setAdminEmail(textValue(values.admin_email));
        setSiteUrl(textValue(values.site_url));
        setGeneralDirty(false);
      } else if (group === 'reading') {
        setHomepageMode(values.homepage_mode === 'static_page' ? 'static_page' : 'latest_posts');
        setHomepageId(textValue(values.homepage_id));
        setPostsPageId(textValue(values.posts_page_id));
        setPostsPerPage(textValue(values.posts_per_page));
        setReadingDirty(false);
      } else {
        setDefaultCategory(textValue(values.default_post_category));
        setDefaultAuthor(textValue(values.default_author));
        setWritingDirty(false);
      }
      setLoaded((prev) => ({ ...prev, [group]: true }));
    } catch (caught) {
      setErrors((prev) => ({ ...prev, [group]: toMessage(caught) }));
    } finally {
      setLoading((prev) => ({ ...prev, [group]: false }));
    }
  }

  useEffect(() => {
    void loadGroup('general');
  }, []);

  function handleTabChange(tab: SettingsTab) {
    setActiveTab(tab);
    setNotice(null);
    if (!loaded[tab] && !loading[tab]) {
      void loadGroup(tab);
    }
  }

  async function saveGeneral(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.general || !generalDirty) return;
    setSaving((prev) => ({ ...prev, general: true }));
    setNotice(null);
    try {
      await updateOptions('general', {
        site_title: siteTitle,
        site_tagline: siteTagline,
        admin_email: adminEmail,
        site_url: siteUrl,
      });
      setGeneralDirty(false);
      setNotice({ tone: 'success', text: 'Settings saved.' });
    } catch (caught) {
      setNotice({ tone: 'error', text: toMessage(caught) });
    } finally {
      setSaving((prev) => ({ ...prev, general: false }));
    }
  }

  async function saveReading(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.reading || !readingDirty) return;
    setSaving((prev) => ({ ...prev, reading: true }));
    setNotice(null);
    try {
      await updateOptions('reading', {
        homepage_mode: homepageMode,
        homepage_id: homepageId.trim() === '' ? null : homepageId.trim(),
        posts_page_id: postsPageId.trim() === '' ? null : postsPageId.trim(),
        posts_per_page: Number(postsPerPage),
      });
      setReadingDirty(false);
      setNotice({ tone: 'success', text: 'Settings saved.' });
    } catch (caught) {
      setNotice({ tone: 'error', text: toMessage(caught) });
    } finally {
      setSaving((prev) => ({ ...prev, reading: false }));
    }
  }

  async function saveWriting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.writing || !writingDirty) return;
    setSaving((prev) => ({ ...prev, writing: true }));
    setNotice(null);
    try {
      await updateOptions('writing', {
        default_post_category: defaultCategory.trim() === '' ? null : defaultCategory.trim(),
        default_author: defaultAuthor.trim() === '' ? null : defaultAuthor.trim(),
      });
      setWritingDirty(false);
      setNotice({ tone: 'success', text: 'Settings saved.' });
    } catch (caught) {
      setNotice({ tone: 'error', text: toMessage(caught) });
    } finally {
      setSaving((prev) => ({ ...prev, writing: false }));
    }
  }

  const tabLabel = (tab: SettingsTab) =>
    tab === 'general' ? 'General' : tab === 'reading' ? 'Reading' : 'Writing';

  const renderForm = () => {
    if (activeTab === 'general') {
      return (
        <div className="content-card">
          <form onSubmit={saveGeneral} aria-label="General settings">
            <div className="field">
              <label htmlFor="site_title">Site Title (site_title)</label>
              <input
                id="site_title"
                type="text"
                value={siteTitle}
                onChange={(event) => {
                  setSiteTitle(event.target.value);
                  setGeneralDirty(true);
                }}
                disabled={saving.general}
              />
            </div>
            <div className="field">
              <label htmlFor="site_tagline">Tagline (site_tagline)</label>
              <input
                id="site_tagline"
                type="text"
                value={siteTagline}
                onChange={(event) => {
                  setSiteTagline(event.target.value);
                  setGeneralDirty(true);
                }}
                disabled={saving.general}
              />
              <p className="field-help">In a few words, explain what this site is about.</p>
            </div>
            <div className="field">
              <label htmlFor="admin_email">Administration Email Address (admin_email)</label>
              <input
                id="admin_email"
                type="email"
                value={adminEmail}
                onChange={(event) => {
                  setAdminEmail(event.target.value);
                  setGeneralDirty(true);
                }}
                disabled={saving.general}
              />
              <p className="field-help">This address is used for admin purposes.</p>
            </div>
            <div className="field">
              <label htmlFor="site_url">Site Address (URL) (site_url)</label>
              <input
                id="site_url"
                type="url"
                value={siteUrl}
                onChange={(event) => {
                  setSiteUrl(event.target.value);
                  setGeneralDirty(true);
                }}
                disabled={saving.general}
              />
            </div>
            <div className="field actions">
              <button
                type="submit"
                className="button primary-button"
                disabled={!generalDirty || saving.general}
                aria-busy={saving.general}
              >
                {saving.general ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      );
    }

    if (activeTab === 'reading') {
      return (
        <div className="content-card">
          <form onSubmit={saveReading} aria-label="Reading settings">
            <div className="field">
              <fieldset>
                <legend>Homepage (homepage_mode)</legend>
                <div>
                  <label>
                    <input
                      type="radio"
                      name="homepage_mode"
                      value="latest_posts"
                      checked={homepageMode === 'latest_posts'}
                      onChange={() => {
                        setHomepageMode('latest_posts');
                        setReadingDirty(true);
                      }}
                      disabled={saving.reading}
                    />{' '}
                    Your latest posts (latest_posts)
                  </label>
                </div>
                <div>
                  <label>
                    <input
                      type="radio"
                      name="homepage_mode"
                      value="static_page"
                      checked={homepageMode === 'static_page'}
                      onChange={() => {
                        setHomepageMode('static_page');
                        setReadingDirty(true);
                      }}
                      disabled={saving.reading}
                    />{' '}
                    A static page (static_page)
                  </label>
                </div>
              </fieldset>
            </div>
            <div className="field">
              <label htmlFor="homepage_id">Homepage (homepage_id)</label>
              <input
                id="homepage_id"
                type="text"
                value={homepageId}
                onChange={(event) => {
                  setHomepageId(event.target.value);
                  setReadingDirty(true);
                }}
                disabled={saving.reading}
                placeholder="Paste the page ID"
              />
              <p className="field-help">Paste the page ID.</p>
            </div>
            <div className="field">
              <label htmlFor="posts_page_id">Posts page (posts_page_id)</label>
              <input
                id="posts_page_id"
                type="text"
                value={postsPageId}
                onChange={(event) => {
                  setPostsPageId(event.target.value);
                  setReadingDirty(true);
                }}
                disabled={saving.reading}
                placeholder="Paste the page ID"
              />
              <p className="field-help">Paste the page ID.</p>
            </div>
            <div className="field">
              <label htmlFor="posts_per_page">Blog pages show at most (posts_per_page)</label>
              <input
                id="posts_per_page"
                type="number"
                min={1}
                max={100}
                value={postsPerPage}
                onChange={(event) => {
                  setPostsPerPage(event.target.value);
                  setReadingDirty(true);
                }}
                disabled={saving.reading}
              />
              <p className="field-help">posts per page (1–100).</p>
            </div>
            <div className="field actions">
              <button
                type="submit"
                className="button primary-button"
                disabled={!readingDirty || saving.reading}
                aria-busy={saving.reading}
              >
                {saving.reading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      );
    }

    return (
      <div className="content-card">
        <form onSubmit={saveWriting} aria-label="Writing settings">
          <div className="field">
            <label htmlFor="default_post_category">
              Default post category (default_post_category)
            </label>
            <input
              id="default_post_category"
              type="text"
              value={defaultCategory}
              onChange={(event) => {
                setDefaultCategory(event.target.value);
                setWritingDirty(true);
              }}
              disabled={saving.writing}
            />
            <p className="field-help">Slug of the default category, or empty for none.</p>
          </div>
          <div className="field">
            <label htmlFor="default_author">Default author (default_author)</label>
            <input
              id="default_author"
              type="text"
              value={defaultAuthor}
              onChange={(event) => {
                setDefaultAuthor(event.target.value);
                setWritingDirty(true);
              }}
              disabled={saving.writing}
            />
            <p className="field-help">UUID of the default author, or empty for none.</p>
          </div>
          <div className="field actions">
            <button
              type="submit"
              className="button primary-button"
              disabled={!writingDirty || saving.writing}
              aria-busy={saving.writing}
            >
              {saving.writing ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    );
  };

  const currentLoading = loading[activeTab];
  const currentError = errors[activeTab];

  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings" description="Manage site-wide options." />
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <div className="taxonomy-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            className={`button small-button${activeTab === tab.value ? ' nav-link-active' : ''}`}
            onClick={() => handleTabChange(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {currentLoading ? (
        <Skeleton label={`Loading ${tabLabel(activeTab)} settings…`} lines={5} />
      ) : currentError ? (
        <ErrorState
          title={`Could not load ${tabLabel(activeTab)} settings`}
          message={currentError}
          onRetry={() => void loadGroup(activeTab)}
        />
      ) : (
        renderForm()
      )}
    </>
  );
}
