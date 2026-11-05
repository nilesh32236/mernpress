import { Fragment, useEffect, useState, type FormEvent } from 'react';
import {
  actionErrorMessage,
  createPrivacyPolicyPage,
  fetchOptions,
  fetchPosts,
  setPrivacyPolicyPage,
  updateOptions,
  type OptionGroup,
  type OptionValues,
} from './api.js';
import { Notice, type NoticeMessage } from './components.js';
import { navigate } from './router.js';

type FieldType = 'text' | 'number' | 'checkbox' | 'select' | 'textarea' | 'page';

interface Field {
  key: string;
  label: string;
  type: FieldType;
  /** WordPress settings-section heading printed before this field. */
  section?: string;
  help?: string;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  width?: number;
}

const DISCUSSION_FIELDS: Field[] = [
  {
    key: 'default_comment_status',
    section: 'Default article settings',
    label: 'Default comment status',
    type: 'select',
    options: [
      { value: 'open', label: 'Open' },
      { value: 'closed', label: 'Closed' },
    ],
    help: 'Applies to newly created posts and pages.',
  },
  {
    key: 'require_name_email',
    section: 'Other comment settings',
    label: 'Comment author must fill out name and email',
    type: 'checkbox',
  },
  {
    key: 'comment_registration',
    label: 'Users must be registered and logged in to comment',
    type: 'checkbox',
  },
  {
    key: 'close_comments_for_old_posts',
    label: 'Automatically close comments on posts older than the specified number of days',
    type: 'checkbox',
  },
  {
    key: 'close_comments_days_old',
    label: 'Days old',
    type: 'number',
    min: 1,
    max: 3650,
    width: 70,
  },
  {
    key: 'thread_comments',
    label: 'Enable threaded (nested) comments',
    type: 'checkbox',
  },
  {
    key: 'thread_comments_depth',
    label: 'Levels deep',
    type: 'number',
    min: 1,
    max: 10,
    width: 70,
  },
  {
    key: 'page_comments',
    label: 'Break comments into pages',
    type: 'checkbox',
  },
  {
    key: 'comments_per_page',
    label: 'Top level comments per page',
    type: 'number',
    min: 1,
    max: 200,
    width: 70,
  },
  {
    key: 'default_comments_page',
    label: 'Default comments page',
    type: 'select',
    options: [
      { value: 'newest', label: 'Last page' },
      { value: 'oldest', label: 'First page' },
    ],
  },
  {
    key: 'comment_order',
    label: 'Comments should be displayed with the comments at the top',
    type: 'select',
    options: [
      { value: 'asc', label: 'Older' },
      { value: 'desc', label: 'Newer' },
    ],
  },
  {
    key: 'comments_notify',
    section: 'Email me whenever',
    label: 'Email me whenever anyone posts a comment',
    type: 'checkbox',
    help: 'Sent to the administration email address when outbound mail is configured on the server.',
  },
  {
    key: 'moderation_notify',
    label: 'Email me whenever a comment is held for moderation',
    type: 'checkbox',
    help: 'Sent to the administration email address when outbound mail is configured on the server.',
  },
  {
    key: 'comment_moderation',
    section: 'Before a comment appears',
    label: 'Comment must be manually approved',
    type: 'checkbox',
  },
  {
    key: 'comment_previously_approved',
    label: 'Comment author must have a previously approved comment',
    type: 'checkbox',
  },
  {
    key: 'comment_max_links',
    label: 'Hold a comment in the queue if it contains this number of links or more',
    type: 'number',
    min: 0,
    max: 100,
    width: 70,
  },
  {
    key: 'moderation_keys',
    section: 'Comment moderation',
    label: 'Comment moderation keywords',
    type: 'textarea',
    help: 'One word or phrase per line. Comments containing any of these are held for moderation.',
  },
  {
    key: 'disallowed_keys',
    section: 'Disallowed comment keys',
    label: 'Disallowed comment keys',
    type: 'textarea',
    help: 'One word or phrase per line. Comments containing any of these are marked as spam.',
  },
  {
    key: 'show_avatars',
    section: 'Avatars',
    label: 'Show Avatars',
    type: 'checkbox',
    help: 'This build renders local initials instead of remote Gravatar images.',
  },
  {
    key: 'avatar_rating',
    label: 'Maximum Rating',
    type: 'select',
    options: [
      { value: 'G', label: 'G' },
      { value: 'PG', label: 'PG' },
      { value: 'R', label: 'R' },
      { value: 'X', label: 'X' },
    ],
  },
];

const MEDIA_FIELDS: Field[] = [
  {
    key: 'thumbnail_size_w',
    section: 'Image sizes',
    label: 'Thumbnail size — Width',
    type: 'number',
    min: 0,
    max: 5000,
    width: 90,
  },
  {
    key: 'thumbnail_size_h',
    label: 'Thumbnail size — Height',
    type: 'number',
    min: 0,
    max: 5000,
    width: 90,
  },
  { key: 'thumbnail_crop', label: 'Crop thumbnail to exact dimensions', type: 'checkbox' },
  {
    key: 'medium_size_w',
    label: 'Medium size — Max width',
    type: 'number',
    min: 0,
    max: 5000,
    width: 90,
  },
  {
    key: 'medium_size_h',
    label: 'Medium size — Max height',
    type: 'number',
    min: 0,
    max: 5000,
    width: 90,
  },
  {
    key: 'large_size_w',
    label: 'Large size — Max width',
    type: 'number',
    min: 0,
    max: 10000,
    width: 90,
  },
  {
    key: 'large_size_h',
    label: 'Large size — Max height',
    type: 'number',
    min: 0,
    max: 10000,
    width: 90,
  },
  {
    key: 'uploads_use_yearmonth_folders',
    section: 'Uploading files',
    label: 'Organize my uploads into month- and year-based folders',
    type: 'checkbox',
  },
];

const PRIVACY_FIELDS: Field[] = [
  {
    key: 'wp_page_for_privacy_policy',
    label: 'Privacy Policy page',
    type: 'page',
    help: 'Select the page that contains your privacy policy.',
  },
];

const GROUPS: Partial<Record<OptionGroup, { title: string; fields: Field[] }>> = {
  discussion: { title: 'Discussion Settings', fields: DISCUSSION_FIELDS },
  media: { title: 'Media Settings', fields: MEDIA_FIELDS },
  privacy: { title: 'Privacy Settings', fields: PRIVACY_FIELDS },
};

function fieldValue(values: OptionValues, key: string): string | number | boolean {
  const value = values[key];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return '';
}

export function OptionGroupForm({
  group,
  onTitle,
}: {
  group: OptionGroup;
  onTitle?: (title: string) => void;
}) {
  const config = GROUPS[group];
  const [values, setValues] = useState<OptionValues>({});
  const [pages, setPages] = useState<
    Array<{ id: string; title: string; slug: string; status: string }>
  >([]);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (config) onTitle?.(config.title);
  }, [config, onTitle]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchOptions(group)
      .then((result) => {
        if (!active) return;
        setValues(result);
        setDirty(false);
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
  }, [group]);

  useEffect(() => {
    if (group !== 'privacy') return;
    let active = true;
    // Include drafts: WordPress lets a newly created policy draft be selected.
    fetchPosts({ type: 'page', page: 1, perPage: 100 })
      .then((result) => {
        if (active) {
          setPages(
            result.items
              .filter((page) => page.status !== 'TRASHED')
              .map((page) => ({
                id: page.id,
                title: page.title,
                slug: page.slug,
                status: page.status,
              })),
          );
        }
      })
      .catch(() => {
        if (active) setPages([]);
      });
    return () => {
      active = false;
    };
  }, [group]);

  if (!config) return null;

  const policyKey = 'wp_page_for_privacy_policy';
  const selectedPolicyId = String(fieldValue(values, policyKey) ?? '');
  const selectedPolicy = pages.find((page) => page.id === selectedPolicyId) ?? null;

  async function createPrivacyPolicy(): Promise<void> {
    if (privacyBusy) return;
    setPrivacyBusy(true);
    setNotice(null);
    setError(null);
    try {
      const created = await createPrivacyPolicyPage();
      setPages((current) =>
        current.some((page) => page.id === created.pageId)
          ? current
          : [
              ...current,
              {
                id: created.page.id,
                title: created.page.title,
                slug: created.page.slug,
                status: created.page.status,
              },
            ],
      );
      setValues((current) => ({ ...current, [policyKey]: created.pageId }));
      setDirty(false);
      setNotice({ tone: 'success', text: 'Privacy Policy page created.' });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setPrivacyBusy(false);
    }
  }

  async function usePrivacyPolicy(): Promise<void> {
    if (privacyBusy || !selectedPolicyId) return;
    setPrivacyBusy(true);
    setNotice(null);
    setError(null);
    try {
      const result = await setPrivacyPolicyPage(selectedPolicyId);
      setValues((current) => ({ ...current, [policyKey]: result.pageId }));
      setDirty(false);
      setNotice({ tone: 'success', text: 'Privacy Policy page updated.' });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setPrivacyBusy(false);
    }
  }

  function update(key: string, value: string | number | boolean | null) {
    setValues((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !dirty) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const updated = await updateOptions(group, values);
      setValues(updated);
      setDirty(false);
      setNotice({ tone: 'success', text: 'Settings saved.' });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-panel option-group-form">
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <form onSubmit={submit} aria-label={config.title}>
        {loading ? (
          <p className="field-help">Loading settings…</p>
        ) : (
          config.fields.map((field, index) => (
            <Fragment key={field.key}>
              {field.section && field.section !== config.fields[index - 1]?.section ? (
                <h2 className="option-section-title">{field.section}</h2>
              ) : null}
              <div className="field">
                {field.type === 'checkbox' ? (
                  <span aria-hidden="true" />
                ) : (
                  <label htmlFor={`option-${field.key}`}>{field.label}</label>
                )}
                <div>
                  {field.type === 'checkbox' ? (
                    <label className="checkbox-row">
                      <input
                        id={`option-${field.key}`}
                        type="checkbox"
                        checked={fieldValue(values, field.key) === true}
                        onChange={(event) => update(field.key, event.target.checked)}
                        disabled={saving}
                      />
                      <span>{field.label}</span>
                    </label>
                  ) : null}
                  {field.type === 'select' ? (
                    <select
                      id={`option-${field.key}`}
                      value={String(fieldValue(values, field.key))}
                      onChange={(event) => update(field.key, event.target.value)}
                      disabled={saving}
                    >
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {field.type === 'textarea' ? (
                    <textarea
                      id={`option-${field.key}`}
                      rows={5}
                      value={String(fieldValue(values, field.key))}
                      onChange={(event) => update(field.key, event.target.value)}
                      disabled={saving}
                    />
                  ) : null}
                  {field.type === 'text' ? (
                    <input
                      id={`option-${field.key}`}
                      type="text"
                      value={String(fieldValue(values, field.key))}
                      onChange={(event) => update(field.key, event.target.value)}
                      disabled={saving}
                    />
                  ) : null}
                  {field.type === 'number' ? (
                    <input
                      id={`option-${field.key}`}
                      className="small-text"
                      type="number"
                      min={field.min}
                      max={field.max}
                      style={field.width ? { width: field.width } : undefined}
                      value={Number(fieldValue(values, field.key))}
                      onChange={(event) => update(field.key, Number(event.target.value))}
                      disabled={saving}
                    />
                  ) : null}
                  {field.type === 'page' ? (
                    <select
                      id={`option-${field.key}`}
                      value={String(fieldValue(values, field.key) ?? '')}
                      onChange={(event) =>
                        update(field.key, event.target.value ? event.target.value : null)
                      }
                      disabled={saving}
                    >
                      <option value="">— Select —</option>
                      {pages.map((page) => (
                        <option key={page.id} value={page.id}>
                          {page.title}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {group === 'privacy' && field.key === policyKey ? (
                    <div className="privacy-policy-actions">
                      {selectedPolicyId ? (
                        <>
                          {selectedPolicy ? (
                            <p className="field-help">
                              <a
                                href={`/admin/pages/${selectedPolicy.id}/edit`}
                                onClick={(event) => {
                                  event.preventDefault();
                                  navigate(`/pages/${selectedPolicy.id}/edit`);
                                }}
                              >
                                Edit page
                              </a>
                              <span aria-hidden="true"> | </span>
                              <a href={`/${selectedPolicy.slug}`} target="_blank" rel="noreferrer">
                                View page
                              </a>
                            </p>
                          ) : null}
                          <button
                            type="button"
                            className="button secondary-button"
                            onClick={() => void usePrivacyPolicy()}
                            disabled={privacyBusy || saving}
                          >
                            {privacyBusy ? 'Applying…' : 'Use This Page'}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="button primary-button"
                          onClick={() => void createPrivacyPolicy()}
                          disabled={privacyBusy || saving}
                        >
                          {privacyBusy ? 'Creating…' : 'Create a new Privacy Policy page'}
                        </button>
                      )}
                      <p className="field-help">
                        Creating a page starts from a suggested template and selects it. &ldquo;Use
                        This Page&rdquo; selects the page chosen above without changing other
                        settings.
                      </p>
                    </div>
                  ) : null}
                  {field.help ? <p className="field-help">{field.help}</p> : null}
                </div>
              </div>
            </Fragment>
          ))
        )}
        <div className="field actions">
          <button type="submit" className="button primary-button" disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
