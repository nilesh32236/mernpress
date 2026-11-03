import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  actionErrorMessage,
  fetchOptions,
  getMedia,
  listMedia,
  updateOptions,
  type AuthUser,
  type MediaItem,
  type OptionGroup,
  type OptionValues,
} from './api.js';
import { ErrorState, Notice, PageHeader, Skeleton, type NoticeMessage } from './components.js';
import { useLocation } from './router.js';
import { cacheSiteFormats, formatSettingsDate, formatSettingsTime } from './format.js';

type SettingsTab = OptionGroup;

function GeneralIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function ReadingIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function WritingIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function FieldLabel({ children }: { icon?: ReactNode; children: ReactNode }) {
  return <span className="field-label-text">{children}</span>;
}

const TABS: Array<{ value: SettingsTab; label: string; icon: ReactNode }> = [
  { value: 'general', label: 'General', icon: <GeneralIcon /> },
  { value: 'writing', label: 'Writing', icon: <WritingIcon /> },
  { value: 'reading', label: 'Reading', icon: <ReadingIcon /> },
];

function tabFromHash(hash: string): SettingsTab {
  if (hash === '#reading') return 'reading';
  if (hash === '#writing') return 'writing';
  return 'general';
}

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
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
    typeof window === 'undefined' ? 'general' : tabFromHash(window.location.hash),
  );

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
  const [siteIcon, setSiteIcon] = useState<string | null>(null);
  const [siteIconMedia, setSiteIconMedia] = useState<MediaItem | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconItems, setIconItems] = useState<MediaItem[] | null>(null);
  const [usersCanRegister, setUsersCanRegister] = useState(false);
  const [defaultRole, setDefaultRole] = useState('subscriber');
  const [siteLanguage, setSiteLanguage] = useState('en_US');
  const [timezone, setTimezone] = useState('UTC');
  const [dateFormat, setDateFormat] = useState('Y/m/d');
  const [timeFormat, setTimeFormat] = useState('g:i a');
  const [weekStartsOn, setWeekStartsOn] = useState('1');
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
        const iconId = typeof values.site_icon === 'string' ? values.site_icon : null;
        setSiteIcon(iconId);
        if (iconId) {
          getMedia(iconId)
            .then((item) => setSiteIconMedia(item))
            .catch(() => setSiteIconMedia(null));
        } else {
          setSiteIconMedia(null);
        }
        setUsersCanRegister(values.users_can_register === true);
        setDefaultRole(textValue(values.default_role) || 'subscriber');
        setSiteLanguage(textValue(values.site_language) || 'en_US');
        setTimezone(textValue(values.timezone) || 'UTC');
        setDateFormat(textValue(values.date_format) || 'Y/m/d');
        setTimeFormat(textValue(values.time_format) || 'g:i a');
        setWeekStartsOn(textValue(values.week_starts_on) || '1');
        cacheSiteFormats(
          textValue(values.date_format) || 'Y/m/d',
          textValue(values.time_format) || 'g:i a',
        );
        try {
          window.localStorage.setItem(
            'mernpress.defaultRole',
            textValue(values.default_role) || 'subscriber',
          );
        } catch {
          // Storage is optional.
        }
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

  // Sidebar submenu links deep-link via #reading / #writing. pushState does
  // not fire hashchange, so sync from the router location instead. This also
  // performs the initial load (location is populated on mount).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tab = tabFromHash(window.location.hash);
    setActiveTab(tab);
    setNotice(null);
    if (!loaded[tab] && !loading[tab]) {
      void loadGroup(tab);
    }
  }, [location]);

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
        site_icon: siteIcon,
        users_can_register: usersCanRegister,
        default_role: defaultRole,
        site_language: siteLanguage,
        timezone,
        date_format: dateFormat,
        time_format: timeFormat,
        week_starts_on: Number(weekStartsOn),
      });
      cacheSiteFormats(dateFormat, timeFormat);
      try {
        window.localStorage.setItem('mernpress.defaultRole', defaultRole);
      } catch {
        // Storage is optional.
      }
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
              <label htmlFor="site_title">
                <FieldLabel icon={<GeneralIcon />}>Site Title</FieldLabel>
              </label>
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
              <label htmlFor="site_tagline">
                <FieldLabel icon={<ReadingIcon />}>Tagline</FieldLabel>
              </label>
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
              <span className="field-label">Site Icon</span>
              <div>
                {siteIconMedia ? (
                  <div className="site-icon-current">
                    <img src={siteIconMedia.derivatives['300'] ?? siteIconMedia.url} alt="" />
                    <button
                      type="button"
                      className="button secondary-button"
                      onClick={() => {
                        setIconPickerOpen(true);
                        setIconItems(null);
                        void listMedia({ type: 'image', perPage: 24 })
                          .then((result) => setIconItems(result.items))
                          .catch(() => setIconItems([]));
                      }}
                    >
                      Change Site Icon
                    </button>
                    <button
                      type="button"
                      className="button-link-delete"
                      onClick={() => {
                        setSiteIcon(null);
                        setSiteIconMedia(null);
                        setGeneralDirty(true);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="button secondary-button"
                    onClick={() => {
                      setIconPickerOpen(true);
                      setIconItems(null);
                      void listMedia({ type: 'image', perPage: 24 })
                        .then((result) => setIconItems(result.items))
                        .catch(() => setIconItems([]));
                    }}
                  >
                    Choose a Site Icon
                  </button>
                )}
                <p className="field-help">
                  The Site Icon is used as a browser and app icon for your site. It must be square
                  and at least 512 × 512 pixels.
                </p>
              </div>
            </div>
            <div className="field">
              <label htmlFor="admin_email">
                <FieldLabel icon={<GeneralIcon />}>Administration Email Address</FieldLabel>
              </label>
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
              <label htmlFor="site_url">
                <FieldLabel icon={<GeneralIcon />}>Site Address (URL)</FieldLabel>
              </label>
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
            <div className="field">
              <label htmlFor="users_can_register">Membership</label>
              <div>
                <label className="checkbox-row">
                  <input
                    id="users_can_register"
                    type="checkbox"
                    checked={usersCanRegister}
                    onChange={(event) => {
                      setUsersCanRegister(event.target.checked);
                      setGeneralDirty(true);
                    }}
                    disabled={saving.general}
                  />
                  <span>Anyone can register</span>
                </label>
                <p className="field-help">
                  Public registration is not exposed by this build; the setting is preserved for
                  parity.
                </p>
              </div>
            </div>

            <div className="field">
              <label htmlFor="default_role">New User Default Role</label>
              <select
                id="default_role"
                value={defaultRole}
                onChange={(event) => {
                  setDefaultRole(event.target.value);
                  setGeneralDirty(true);
                }}
                disabled={saving.general}
              >
                <option value="administrator">Administrator</option>
                <option value="editor">Editor</option>
                <option value="author">Author</option>
                <option value="contributor">Contributor</option>
                <option value="subscriber">Subscriber</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="site_language">Site Language</label>
              <select
                id="site_language"
                value={siteLanguage}
                onChange={(event) => {
                  setSiteLanguage(event.target.value);
                  setGeneralDirty(true);
                }}
                disabled={saving.general}
              >
                <option value="en_US">English (United States)</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="timezone">Timezone</label>
              <select
                id="timezone"
                value={timezone}
                onChange={(event) => {
                  setTimezone(event.target.value);
                  setGeneralDirty(true);
                }}
                disabled={saving.general}
              >
                {[
                  'UTC',
                  'Asia/Kolkata',
                  'Asia/Dubai',
                  'Europe/London',
                  'Europe/Berlin',
                  'America/New_York',
                  'America/Chicago',
                  'America/Los_Angeles',
                  'Australia/Sydney',
                ].map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
              <p className="field-help">Choose a city in the same timezone as you.</p>
            </div>

            <div className="field">
              <label htmlFor="date_format">Date Format</label>
              <div className="format-options" role="radiogroup" aria-label="Date Format">
                {[
                  ['Y/m/d', '2026/11/03'],
                  ['F j, Y', 'November 3, 2026'],
                  ['Y-m-d', '2026-11-03'],
                  ['m/d/Y', '11/03/2026'],
                  ['d/m/Y', '03/11/2026'],
                  ['d.m.Y', '03.11.2026'],
                ].map(([value, label]) => (
                  <label key={value} className="format-option">
                    <input
                      id={value === 'Y/m/d' ? 'date_format' : undefined}
                      type="radio"
                      name="date_format"
                      value={value}
                      checked={dateFormat === value}
                      onChange={() => {
                        setDateFormat(value!);
                        cacheSiteFormats(value!, timeFormat);
                        setGeneralDirty(true);
                      }}
                      disabled={saving.general}
                    />
                    <span className="format-preview">{label}</span>
                    <code>{value}</code>
                  </label>
                ))}
                <p className="field-help">Preview: {formatSettingsDate(new Date(), dateFormat)}</p>
              </div>
            </div>

            <div className="field">
              <label htmlFor="time_format">Time Format</label>
              <div className="format-options" role="radiogroup" aria-label="Time Format">
                {[
                  ['g:i a', '8:15 am'],
                  ['g:i A', '8:15 AM'],
                  ['H:i', '08:15'],
                ].map(([value, label]) => (
                  <label key={value} className="format-option">
                    <input
                      id={value === 'g:i a' ? 'time_format' : undefined}
                      type="radio"
                      name="time_format"
                      value={value}
                      checked={timeFormat === value}
                      onChange={() => {
                        setTimeFormat(value!);
                        cacheSiteFormats(dateFormat, value!);
                        setGeneralDirty(true);
                      }}
                      disabled={saving.general}
                    />
                    <span className="format-preview">{label}</span>
                    <code>{value}</code>
                  </label>
                ))}
                <p className="field-help">Preview: {formatSettingsTime(new Date(), timeFormat)}</p>
              </div>
            </div>

            <div className="field">
              <label htmlFor="week_starts_on">Week Starts On</label>
              <select
                id="week_starts_on"
                value={weekStartsOn}
                onChange={(event) => {
                  setWeekStartsOn(event.target.value);
                  setGeneralDirty(true);
                }}
                disabled={saving.general}
              >
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </select>
            </div>

            <div className="field actions">
              <button
                type="submit"
                className="button primary-button"
                disabled={saving.general}
                aria-busy={saving.general}
              >
                {saving.general ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>

          {iconPickerOpen ? (
            <div
              className="site-icon-overlay"
              role="presentation"
              onClick={(event) => {
                if (event.target === event.currentTarget) setIconPickerOpen(false);
              }}
            >
              <div
                className="site-icon-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="Choose a Site Icon"
              >
                <h2>Choose a Site Icon</h2>
                {iconItems === null ? (
                  <p className="field-help">Loading media…</p>
                ) : iconItems.length === 0 ? (
                  <p className="field-help">No images found. Upload one in the Media Library.</p>
                ) : (
                  <div className="site-icon-grid">
                    {iconItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="site-icon-item"
                        onClick={() => {
                          setSiteIcon(item.id);
                          setSiteIconMedia(item);
                          setIconPickerOpen(false);
                          setGeneralDirty(true);
                        }}
                      >
                        <img
                          src={item.derivatives['300'] ?? item.url}
                          alt={item.altText || item.originalName}
                        />
                      </button>
                    ))}
                  </div>
                )}
                <div className="site-icon-actions">
                  <button
                    type="button"
                    className="button secondary-button"
                    onClick={() => setIconPickerOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}
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
      <PageHeader
        title={
          activeTab === 'general'
            ? 'General Settings'
            : activeTab === 'reading'
              ? 'Reading Settings'
              : 'Writing Settings'
        }
      />
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={`settings-tab-${tab.value}`}
            aria-selected={activeTab === tab.value}
            aria-controls={`settings-panel-${tab.value}`}
            className={`settings-tab${activeTab === tab.value ? ' is-active' : ''}`}
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
        <div
          className="settings-panel"
          role="tabpanel"
          id={`settings-panel-${activeTab}`}
          aria-labelledby={`settings-tab-${activeTab}`}
        >
          {renderForm()}
        </div>
      )}
    </>
  );
}
