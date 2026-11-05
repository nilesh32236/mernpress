import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  actionErrorMessage,
  fetchOptions,
  fetchPosts,
  fetchTerms,
  fetchUsers,
  getMedia,
  listMedia,
  updateOptions,
  type AuthUser,
  type MediaItem,
  type OptionGroup,
  type OptionValues,
} from './api.js';
import { ErrorState, Notice, PageHeader, Skeleton, type NoticeMessage } from './components.js';
import { OptionGroupForm } from './OptionGroupForm.js';
import { MailLogPanel } from './MailLogPanel.js';
import { PermalinkSettings } from './PermalinkSettings.js';
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

function FieldLabel({ children }: { icon?: ReactNode; children: ReactNode }) {
  return <span className="field-label-text">{children}</span>;
}

function tabFromHash(hash: string): SettingsTab {
  if (hash === '#reading') return 'reading';
  if (hash === '#writing') return 'writing';
  if (hash === '#discussion') return 'discussion';
  if (hash === '#media') return 'media';
  if (hash === '#permalinks') return 'permalinks';
  if (hash === '#privacy') return 'privacy';
  return 'general';
}

const SIMPLE_GROUPS: ReadonlySet<SettingsTab> = new Set([
  'discussion',
  'media',
  'permalinks',
  'privacy',
]);

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

const DATE_PRESETS = ['F j, Y', 'Y-m-d', 'm/d/Y', 'd/m/Y', 'd.m.Y'];
const TIME_PRESETS = ['g:i a', 'g:i A', 'H:i'];

export function SettingsPage({ user: _user }: { user: AuthUser }) {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
    typeof window === 'undefined' ? 'general' : tabFromHash(window.location.hash),
  );

  const [loaded, setLoaded] = useState<Record<OptionGroup, boolean>>({
    general: false,
    reading: false,
    writing: false,
    discussion: false,
    media: false,
    permalinks: false,
    privacy: false,
  });
  const [loading, setLoading] = useState<Record<OptionGroup, boolean>>({
    general: false,
    reading: false,
    writing: false,
    discussion: false,
    media: false,
    permalinks: false,
    privacy: false,
  });
  const [errors, setErrors] = useState<Record<OptionGroup, string | null>>({
    general: null,
    reading: null,
    writing: null,
    discussion: null,
    media: null,
    permalinks: null,
    privacy: null,
  });
  const [saving, setSaving] = useState<Record<OptionGroup, boolean>>({
    general: false,
    reading: false,
    writing: false,
    discussion: false,
    media: false,
    permalinks: false,
    privacy: false,
  });

  const [notice, setNotice] = useState<NoticeMessage | null>(null);

  const [siteTitle, setSiteTitle] = useState('');
  const [siteTagline, setSiteTagline] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [wordpressUrl, setWordpressUrl] = useState('');
  const [siteIcon, setSiteIcon] = useState<string | null>(null);
  const [siteIconMedia, setSiteIconMedia] = useState<MediaItem | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconItems, setIconItems] = useState<MediaItem[] | null>(null);
  const [usersCanRegister, setUsersCanRegister] = useState(false);
  const [defaultRole, setDefaultRole] = useState('subscriber');
  const [siteLanguage, setSiteLanguage] = useState('en_US');
  const [timezone, setTimezone] = useState('UTC');
  const [dateFormat, setDateFormat] = useState('F j, Y');
  const [customDateFormat, setCustomDateFormat] = useState('F j, Y');
  const [timeFormat, setTimeFormat] = useState('g:i a');
  const [customTimeFormat, setCustomTimeFormat] = useState('g:i a');
  const [weekStartsOn, setWeekStartsOn] = useState('1');
  const [generalDirty, setGeneralDirty] = useState(false);

  const [homepageMode, setHomepageMode] = useState<'latest_posts' | 'static_page'>('latest_posts');
  const [homepageId, setHomepageId] = useState('');
  const [postsPageId, setPostsPageId] = useState('');
  const [postsPerPage, setPostsPerPage] = useState('10');
  const [postsPerRss, setPostsPerRss] = useState('10');
  const [rssUseExcerpt, setRssUseExcerpt] = useState<'full' | 'excerpt'>('full');
  const [blogPublic, setBlogPublic] = useState(true);
  const [, setReadingDirty] = useState(false);

  const [defaultCategory, setDefaultCategory] = useState('');
  const [defaultFormat, setDefaultFormat] = useState('standard');
  const [mailServer, setMailServer] = useState('mail.example.com');
  const [mailPort, setMailPort] = useState('110');
  const [mailLogin, setMailLogin] = useState('');
  const [mailPass, setMailPass] = useState('');
  const [defaultEmailCategory, setDefaultEmailCategory] = useState('uncategorized');
  const [pingSites, setPingSites] = useState('');
  const [, setWritingDirty] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<Array<{
    id: string;
    name: string;
    slug: string;
  }> | null>(null);
  const [pageOptions, setPageOptions] = useState<Array<{ id: string; title: string }> | null>(null);
  const [userOptions, setUserOptions] = useState<Array<{ id: string; username: string }> | null>(
    null,
  );

  async function loadGroup(group: OptionGroup) {
    setLoading((prev) => ({ ...prev, [group]: true }));
    setErrors((prev) => ({ ...prev, [group]: null }));
    try {
      const values: OptionValues = await fetchOptions(group);
      if (group === 'general') {
        setSiteTitle(textValue(values.site_title));
        setSiteTagline(textValue(values.site_tagline));
        setAdminEmail(textValue(values.admin_email));
        const storedSiteUrl = textValue(values.site_url);
        const fallbackUrl = typeof window === 'undefined' ? '' : window.location.origin;
        setSiteUrl(storedSiteUrl || fallbackUrl);
        setWordpressUrl(textValue(values.wordpress_url) || storedSiteUrl || fallbackUrl);
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
        const loadedDateFormat = textValue(values.date_format) || 'F j, Y';
        const loadedTimeFormat = textValue(values.time_format) || 'g:i a';
        setDateFormat(loadedDateFormat);
        setCustomDateFormat(loadedDateFormat);
        setTimeFormat(loadedTimeFormat);
        setCustomTimeFormat(loadedTimeFormat);
        setWeekStartsOn(textValue(values.week_starts_on) || '1');
        cacheSiteFormats(loadedDateFormat, loadedTimeFormat);
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
        setDefaultFormat(textValue(values.default_post_format) || 'standard');
        setMailServer(textValue(values.mailserver_url) || 'mail.example.com');
        setMailPort(textValue(values.mailserver_port) || '110');
        setMailLogin(textValue(values.mailserver_login));
        setMailPass(textValue(values.mailserver_pass));
        setDefaultEmailCategory(textValue(values.default_email_category) || 'uncategorized');
        setPingSites(textValue(values.ping_sites));
        try {
          window.localStorage.setItem(
            'mernpress.defaultPostFormat',
            textValue(values.default_post_format) || 'standard',
          );
        } catch {
          // Storage is optional.
        }
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
    if (!SIMPLE_GROUPS.has(tab) && !loaded[tab] && !loading[tab]) {
      void loadGroup(tab);
    }
  }, [location]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activeTab === 'writing' && categoryOptions === null) {
      fetchTerms({ taxonomy: 'category', perPage: 100, sort: 'name', order: 'asc' })
        .then((result) =>
          setCategoryOptions(result.items.map((t) => ({ id: t.id, name: t.name, slug: t.slug }))),
        )
        .catch(() => setCategoryOptions([]));
    }
    if (activeTab === 'writing' && userOptions === null) {
      fetchUsers({ perPage: 100 })
        .then((result) =>
          setUserOptions(result.items.map((u) => ({ id: u.id, username: u.username }))),
        )
        .catch(() => setUserOptions([]));
    }
  }, [activeTab, categoryOptions, userOptions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (homepageMode === 'static_page' && pageOptions === null) {
      fetchPosts({ type: 'page', status: 'PUBLISHED', page: 1, perPage: 100 })
        .then((result) => setPageOptions(result.items.map((p) => ({ id: p.id, title: p.title }))))
        .catch(() => setPageOptions([]));
    }
  }, [homepageMode, pageOptions]);

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
        wordpress_url: wordpressUrl,
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
    if (saving.reading) return;
    setSaving((prev) => ({ ...prev, reading: true }));
    setNotice(null);
    try {
      await updateOptions('reading', {
        homepage_mode: homepageMode,
        homepage_id: homepageId.trim() === '' ? null : homepageId.trim(),
        posts_page_id: postsPageId.trim() === '' ? null : postsPageId.trim(),
        posts_per_page: Number(postsPerPage),
        posts_per_rss: Number(postsPerRss) || 10,
        rss_use_excerpt: rssUseExcerpt === 'excerpt',
        blog_public: blogPublic,
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
    if (saving.writing) return;
    setSaving((prev) => ({ ...prev, writing: true }));
    setNotice(null);
    try {
      await updateOptions('writing', {
        default_post_category: defaultCategory.trim() === '' ? null : defaultCategory.trim(),
        default_post_format: defaultFormat,
        mailserver_url: mailServer,
        mailserver_port: Number(mailPort) || 110,
        mailserver_login: mailLogin,
        mailserver_pass: mailPass,
        default_email_category: defaultEmailCategory,
        ping_sites: pingSites,
      });
      try {
        window.localStorage.setItem('mernpress.defaultPostFormat', defaultFormat);
      } catch {
        // Storage is optional.
      }
      setWritingDirty(false);
      setNotice({ tone: 'success', text: 'Settings saved.' });
    } catch (caught) {
      setNotice({ tone: 'error', text: toMessage(caught) });
    } finally {
      setSaving((prev) => ({ ...prev, writing: false }));
    }
  }

  const tabLabel = (tab: SettingsTab) => {
    switch (tab) {
      case 'general':
        return 'General';
      case 'reading':
        return 'Reading';
      case 'writing':
        return 'Writing';
      case 'discussion':
        return 'Discussion';
      case 'media':
        return 'Media';
      case 'permalinks':
        return 'Permalinks';
      case 'privacy':
        return 'Privacy';
    }
  };

  const sampleDate = new Date();

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
              <p className="field-help">
                In a few words, explain what this site is about. Example: &ldquo;Just another
                WordPress site.&rdquo;
              </p>
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
              <label htmlFor="wordpress_url">
                <FieldLabel icon={<GeneralIcon />}>WordPress Address (URL)</FieldLabel>
              </label>
              <input
                id="wordpress_url"
                type="url"
                value={wordpressUrl}
                onChange={(event) => {
                  setWordpressUrl(event.target.value);
                  setGeneralDirty(true);
                }}
                disabled={saving.general}
              />
              <p className="field-help">
                The address where your MERNPress installation lives. This build serves the site and
                admin from one origin.
              </p>
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
              <label htmlFor="site_language">
                Site Language{' '}
                <span className="dashicons dashicons-translation" aria-hidden="true" />
              </label>
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
                  ['UTC', 'UTC+0'],
                  ['Asia/Kolkata', 'Asia/Kolkata'],
                  ['Asia/Dubai', 'Asia/Dubai'],
                  ['Europe/London', 'Europe/London'],
                  ['Europe/Berlin', 'Europe/Berlin'],
                  ['America/New_York', 'America/New_York'],
                  ['America/Chicago', 'America/Chicago'],
                  ['America/Los_Angeles', 'America/Los_Angeles'],
                  ['Australia/Sydney', 'Australia/Sydney'],
                ].map(([zone, label]) => (
                  <option key={zone} value={zone}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="field-help">Choose a city in the same timezone as you.</p>
            </div>

            <div className="field">
              <label htmlFor="date_format">Date Format</label>
              <div className="format-options" role="radiogroup" aria-label="Date Format">
                {DATE_PRESETS.map((value, index) => (
                  <label key={value} className="format-option">
                    <input
                      id={index === 0 ? 'date_format' : undefined}
                      type="radio"
                      name="date_format"
                      value={value}
                      checked={dateFormat === value}
                      onChange={() => {
                        setDateFormat(value);
                        cacheSiteFormats(value, timeFormat);
                        setGeneralDirty(true);
                      }}
                      disabled={saving.general}
                    />
                    <span className="format-preview">{formatSettingsDate(sampleDate, value)}</span>
                    <code>{value}</code>
                  </label>
                ))}
                <label className="format-option format-option-custom">
                  <input
                    type="radio"
                    name="date_format"
                    value="custom"
                    checked={!DATE_PRESETS.includes(dateFormat)}
                    onChange={() => {
                      setDateFormat(customDateFormat);
                      cacheSiteFormats(customDateFormat, timeFormat);
                      setGeneralDirty(true);
                    }}
                    disabled={saving.general}
                  />
                  <span className="format-preview">Custom</span>
                  <input
                    type="text"
                    value={customDateFormat}
                    aria-label="Custom date format"
                    maxLength={40}
                    onChange={(event) => {
                      setCustomDateFormat(event.target.value);
                      setDateFormat(event.target.value);
                      cacheSiteFormats(event.target.value, timeFormat);
                      setGeneralDirty(true);
                    }}
                    disabled={saving.general}
                  />
                </label>
                <p className="field-help">Preview: {formatSettingsDate(sampleDate, dateFormat)}</p>
              </div>
            </div>

            <div className="field">
              <label htmlFor="time_format">Time Format</label>
              <div className="format-options" role="radiogroup" aria-label="Time Format">
                {TIME_PRESETS.map((value, index) => (
                  <label key={value} className="format-option">
                    <input
                      id={index === 0 ? 'time_format' : undefined}
                      type="radio"
                      name="time_format"
                      value={value}
                      checked={timeFormat === value}
                      onChange={() => {
                        setTimeFormat(value);
                        cacheSiteFormats(dateFormat, value);
                        setGeneralDirty(true);
                      }}
                      disabled={saving.general}
                    />
                    <span className="format-preview">{formatSettingsTime(sampleDate, value)}</span>
                    <code>{value}</code>
                  </label>
                ))}
                <label className="format-option format-option-custom">
                  <input
                    type="radio"
                    name="time_format"
                    value="custom"
                    checked={!TIME_PRESETS.includes(timeFormat)}
                    onChange={() => {
                      setTimeFormat(customTimeFormat);
                      cacheSiteFormats(dateFormat, customTimeFormat);
                      setGeneralDirty(true);
                    }}
                    disabled={saving.general}
                  />
                  <span className="format-preview">Custom</span>
                  <input
                    type="text"
                    value={customTimeFormat}
                    aria-label="Custom time format"
                    maxLength={40}
                    onChange={(event) => {
                      setCustomTimeFormat(event.target.value);
                      setTimeFormat(event.target.value);
                      cacheSiteFormats(dateFormat, event.target.value);
                      setGeneralDirty(true);
                    }}
                    disabled={saving.general}
                  />
                </label>
                <p className="field-help">Preview: {formatSettingsTime(sampleDate, timeFormat)}</p>
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
              <span className="field-label">Your homepage displays</span>
              <div>
                <p className="radio-line">
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
                    Your latest posts
                  </label>
                </p>
                <p className="radio-line">
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
                    A static page (select below)
                  </label>
                </p>
                <p className="radio-line">
                  <label htmlFor="homepage_id">Homepage:</label>{' '}
                  <select
                    id="homepage_id"
                    value={homepageId}
                    onChange={(event) => {
                      setHomepageId(event.target.value);
                      setReadingDirty(true);
                    }}
                    disabled={saving.reading || homepageMode !== 'static_page'}
                  >
                    <option value="">— Select —</option>
                    {(pageOptions ?? []).map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.title || '(no title)'}
                      </option>
                    ))}
                  </select>
                </p>
                <p className="radio-line">
                  <label htmlFor="posts_page_id">Posts page:</label>{' '}
                  <select
                    id="posts_page_id"
                    value={postsPageId}
                    onChange={(event) => {
                      setPostsPageId(event.target.value);
                      setReadingDirty(true);
                    }}
                    disabled={saving.reading || homepageMode !== 'static_page'}
                  >
                    <option value="">— Select —</option>
                    {(pageOptions ?? []).map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.title || '(no title)'}
                      </option>
                    ))}
                  </select>
                </p>
              </div>
            </div>
            <div className="field">
              <label htmlFor="posts_per_page">Number of recent posts shown on archive pages</label>
              <div>
                <input
                  id="posts_per_page"
                  className="small-text"
                  type="number"
                  min={1}
                  max={100}
                  value={postsPerPage}
                  onChange={(event) => {
                    setPostsPerPage(event.target.value);
                    setReadingDirty(true);
                  }}
                  disabled={saving.reading}
                />{' '}
                posts
              </div>
            </div>
            <div className="field">
              <label htmlFor="posts_per_rss">
                Number of recent items shown in syndication feeds
              </label>
              <div>
                <input
                  id="posts_per_rss"
                  className="small-text"
                  type="number"
                  min={1}
                  max={100}
                  value={postsPerRss}
                  onChange={(event) => {
                    setPostsPerRss(event.target.value);
                    setReadingDirty(true);
                  }}
                  disabled={saving.reading}
                />{' '}
                items
              </div>
            </div>
            <div className="field">
              <span className="field-label">For each post in a feed, include</span>
              <div>
                <p className="radio-line">
                  <label>
                    <input
                      type="radio"
                      name="rss_use_excerpt"
                      value="full"
                      checked={rssUseExcerpt === 'full'}
                      onChange={() => {
                        setRssUseExcerpt('full');
                        setReadingDirty(true);
                      }}
                      disabled={saving.reading}
                    />{' '}
                    Full text
                  </label>
                </p>
                <p className="radio-line">
                  <label>
                    <input
                      type="radio"
                      name="rss_use_excerpt"
                      value="excerpt"
                      checked={rssUseExcerpt === 'excerpt'}
                      onChange={() => {
                        setRssUseExcerpt('excerpt');
                        setReadingDirty(true);
                      }}
                      disabled={saving.reading}
                    />{' '}
                    Excerpt
                  </label>
                </p>
                <p className="field-help">
                  Your theme determines how content is displayed in browsers.{' '}
                  <a
                    href="https://wordpress.org/documentation/article/managing-your-blog/#feeds"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Learn more about feeds.
                  </a>
                </p>
              </div>
            </div>
            <div className="field">
              <span className="field-label">Search engine visibility</span>
              <div>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={!blogPublic}
                    onChange={(event) => {
                      setBlogPublic(!event.target.checked);
                      setReadingDirty(true);
                    }}
                    disabled={saving.reading}
                  />{' '}
                  Discourage search engines from indexing this site
                </label>
                <p className="field-help">It is up to search engines to honor this request.</p>
              </div>
            </div>
            <div className="field actions">
              <button
                type="submit"
                className="button primary-button"
                disabled={saving.reading}
                aria-busy={saving.reading}
              >
                {saving.reading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      );
    }

    if (activeTab === 'permalinks') {
      return <PermalinkSettings />;
    }

    if (SIMPLE_GROUPS.has(activeTab)) {
      return (
        <>
          {activeTab === 'privacy' ? (
            <h2 className="settings-section-title">Privacy Settings</h2>
          ) : null}
          {activeTab === 'discussion' ? (
            <div className="settings-pings-notice">
              <span className="settings-pings-label">Pings</span>
              <label
                className="checkbox-row is-disabled"
                title="Pingbacks and trackbacks require an inbound XML-RPC endpoint or link verification, which this build does not expose."
              >
                <input type="checkbox" checked={false} readOnly disabled />
                <span>
                  Allow link notifications from other blogs (pingbacks and trackbacks) on new posts
                </span>
              </label>
              <p className="field-help">
                Not available in this build: pingbacks and trackbacks need an inbound XML-RPC
                endpoint or link verification, which this build does not expose for security.
                Comments are unaffected.
              </p>
            </div>
          ) : null}
          <OptionGroupForm group={activeTab} />
          {activeTab === 'discussion' ? <MailLogPanel /> : null}
        </>
      );
    }

    return (
      <div className="content-card">
        <form onSubmit={saveWriting} aria-label="Writing settings">
          <div className="field">
            <label htmlFor="default_post_category">Default Post Category</label>
            <select
              id="default_post_category"
              value={defaultCategory}
              onChange={(event) => {
                setDefaultCategory(event.target.value);
                setWritingDirty(true);
              }}
              disabled={saving.writing}
            >
              <option value="">Uncategorized</option>
              {(categoryOptions ?? []).map((term) => (
                <option key={term.id} value={term.slug}>
                  {term.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="default_post_format">Default Post Format</label>
            <select
              id="default_post_format"
              value={defaultFormat}
              onChange={(event) => {
                setDefaultFormat(event.target.value);
                setWritingDirty(true);
              }}
              disabled={saving.writing}
            >
              <option value="standard">Standard</option>
              <option value="aside">Aside</option>
              <option value="chat">Chat</option>
              <option value="gallery">Gallery</option>
              <option value="image">Image</option>
              <option value="link">Link</option>
              <option value="quote">Quote</option>
              <option value="status">Status</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
            </select>
          </div>
          <h2 className="profile-section-title">Post via email</h2>
          <p className="field-help">
            Mail posting settings are stored for parity, but this build has no inbound mail
            transport configured, so messages are not imported.
          </p>
          <div className="field">
            <label htmlFor="mailserver_url">Mail Server</label>
            <div className="inline-fields">
              <input
                id="mailserver_url"
                type="text"
                value={mailServer}
                onChange={(event) => {
                  setMailServer(event.target.value);
                  setWritingDirty(true);
                }}
                disabled={saving.writing}
              />
              <label htmlFor="mailserver_port">Port</label>
              <input
                id="mailserver_port"
                className="small-text"
                type="number"
                min={1}
                max={65535}
                value={mailPort}
                onChange={(event) => {
                  setMailPort(event.target.value);
                  setWritingDirty(true);
                }}
                disabled={saving.writing}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="mailserver_login">Login Name</label>
            <input
              id="mailserver_login"
              type="text"
              value={mailLogin}
              onChange={(event) => {
                setMailLogin(event.target.value);
                setWritingDirty(true);
              }}
              disabled={saving.writing}
            />
          </div>
          <div className="field">
            <label htmlFor="mailserver_pass">Password</label>
            <input
              id="mailserver_pass"
              type="password"
              value={mailPass}
              onChange={(event) => {
                setMailPass(event.target.value);
                setWritingDirty(true);
              }}
              disabled={saving.writing}
            />
          </div>
          <div className="field">
            <label htmlFor="default_email_category">Default Mail Category</label>
            <select
              id="default_email_category"
              value={defaultEmailCategory}
              onChange={(event) => {
                setDefaultEmailCategory(event.target.value);
                setWritingDirty(true);
              }}
              disabled={saving.writing}
            >
              <option value="uncategorized">Uncategorized</option>
              {(categoryOptions ?? []).map((term) => (
                <option key={term.id} value={term.slug}>
                  {term.name}
                </option>
              ))}
            </select>
          </div>
          <h2 className="profile-section-title">Update Services</h2>
          <p className="field-help">
            These services are stored for parity; this build does not send XML-RPC pings.
          </p>
          <div className="field">
            <label htmlFor="ping_sites">Update Services</label>
            <textarea
              id="ping_sites"
              rows={6}
              value={pingSites}
              onChange={(event) => {
                setPingSites(event.target.value);
                setWritingDirty(true);
              }}
              disabled={saving.writing}
            />
          </div>
          <div className="field actions">
            <button
              type="submit"
              className="button primary-button"
              disabled={saving.writing}
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
              : activeTab === 'writing'
                ? 'Writing Settings'
                : activeTab === 'discussion'
                  ? 'Discussion Settings'
                  : activeTab === 'media'
                    ? 'Media Settings'
                    : activeTab === 'permalinks'
                      ? 'Permalink Settings'
                      : 'Privacy'
        }
      />
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      {currentLoading ? (
        <Skeleton label={`Loading ${tabLabel(activeTab)} settings…`} lines={5} />
      ) : currentError ? (
        <ErrorState
          title={`Could not load ${tabLabel(activeTab)} settings`}
          message={currentError}
          onRetry={() => void loadGroup(activeTab)}
        />
      ) : (
        <div className="settings-panel" id={`settings-panel-${activeTab}`}>
          {renderForm()}
        </div>
      )}
    </>
  );
}
