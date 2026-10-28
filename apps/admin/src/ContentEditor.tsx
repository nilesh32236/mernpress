import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  actionErrorMessage,
  assignTerms,
  createPost,
  fetchPost,
  fetchTerms,
  transitionPost,
  updatePost,
  ApiError,
  type AdminPost,
  type AdminTerm,
  type AuthUser,
  type ContentType,
  type TransitionAction,
} from './api.js';
import {
  EmptyState,
  ErrorState,
  FieldError,
  Notice,
  Skeleton,
  PageHeader,
  StatusBadge,
  type NoticeMessage,
} from './components.js';
import { formatDateTime } from './format.js';
import { useUnsavedChanges } from './navigation-guard.js';
import { availableTransitions, canAssignTerms, canCreateContent, canEditPost } from './roles.js';
import { editContentPath, listPath, navigate } from './router.js';
import type { BlockCanvasHandle } from './editor/BlockCanvas.js';

// The WordPress canvas is a large chunk; load it only on new/edit routes.
const BlockCanvas = lazy(() => import('./editor/BlockCanvas.js'));

interface FormState {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
}

interface Baseline {
  form: FormState;
  categoryIds: string[];
  tagIds: string[];
}

const EMPTY_FORM: FormState = { title: '', slug: '', excerpt: '', content: '' };
const ACTION_LABELS: Record<TransitionAction, string> = {
  publish: 'Publish',
  unpublish: 'Unpublish',
  trash: 'Trash',
  restore: 'Restore',
};
const ACTION_SUCCESS: Record<TransitionAction, string> = {
  publish: 'Content published.',
  unpublish: 'Content returned to draft.',
  trash: 'Content moved to trash.',
  restore: 'Content restored.',
};

function formFromPost(post: AdminPost): FormState {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? '',
    content: post.content,
  };
}

function termsFromPost(post: AdminPost): { categoryIds: string[]; tagIds: string[] } {
  return {
    categoryIds: post.terms.categories.map((term) => term.id),
    tagIds: post.terms.tags.map((term) => term.id),
  };
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) {
    return {};
  }
  const errors: Record<string, string> = {};
  for (const detail of error.details) {
    if (detail.path) {
      errors[detail.path] = detail.message;
    }
  }
  return errors;
}

type SaveIntent = 'save' | 'publish';

export function ContentEditor({
  user,
  type,
  id,
}: {
  user: AuthUser;
  type: ContentType;
  id?: string;
}) {
  const isNew = id === undefined;
  const [post, setPost] = useState<AdminPost | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [categories, setCategories] = useState<AdminTerm[]>([]);
  const [tags, setTags] = useState<AdminTerm[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState<TransitionAction | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [createdPost, setCreatedPost] = useState<AdminPost | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [contentTouched, setContentTouched] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= 1080,
  );
  const canvasRef = useRef<BlockCanvasHandle>(null);

  const editable = isNew ? canCreateContent(user) : post ? canEditPost(user, post) : false;
  const canAssign = editable && canAssignTerms(user);

  const dirty = useMemo(() => {
    if (!editable || createdPost) return false;
    if (isNew) {
      return (
        contentTouched ||
        form.title.trim() !== '' ||
        form.slug.trim() !== '' ||
        form.excerpt.trim() !== '' ||
        form.content.trim() !== '' ||
        categoryIds.length > 0 ||
        tagIds.length > 0
      );
    }
    if (!baseline) return false;
    return (
      contentTouched ||
      form.title !== baseline.form.title ||
      form.slug !== baseline.form.slug ||
      form.excerpt !== baseline.form.excerpt ||
      !sameIds(categoryIds, baseline.categoryIds) ||
      !sameIds(tagIds, baseline.tagIds)
    );
  }, [baseline, categoryIds, contentTouched, createdPost, editable, form, isNew, tagIds]);

  useUnsavedChanges(dirty, 'You have unsaved changes. Leave this page without saving?');

  useEffect(() => {
    if (isNew) {
      setLoading(false);
      setBaseline(null);
      setContentTouched(false);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError(null);
    setConflict(false);

    fetchPost(id)
      .then((loaded) => {
        if (!active) return;
        const nextForm = formFromPost(loaded);
        const nextTerms = termsFromPost(loaded);
        setPost(loaded);
        setForm(nextForm);
        setCategoryIds(nextTerms.categoryIds);
        setTagIds(nextTerms.tagIds);
        setBaseline({ form: nextForm, ...nextTerms });
        setContentTouched(false);
        setLoading(false);
      })
      .catch((caught) => {
        if (!active) return;
        setLoadError(actionErrorMessage(caught));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, isNew, reloadKey]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchTerms({ taxonomy: 'category', page: 1, perPage: 100 }),
      fetchTerms({ taxonomy: 'tag', page: 1, perPage: 100 }),
    ])
      .then(([categoryPage, tagPage]) => {
        if (!active) return;
        setCategories(categoryPage.items);
        setTags(tagPage.items);
        setTermsError(null);
      })
      .catch(() => {
        if (!active) return;
        setTermsError('Could not load categories and tags. Content can still be saved.');
      });

    return () => {
      active = false;
    };
  }, []);

  function updateForm(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function updateContent(value: string) {
    setForm((current) => (current.content === value ? current : { ...current, content: value }));
  }

  function toggleId(ids: string[], termId: string): string[] {
    return ids.includes(termId) ? ids.filter((value) => value !== termId) : [...ids, termId];
  }

  async function saveTerms(
    postId: string,
    currentPost: AdminPost,
  ): Promise<{ ok: boolean; post?: AdminPost; error?: string }> {
    if (!canAssign) {
      return { ok: true };
    }
    const existing = termsFromPost(currentPost);
    if (sameIds(categoryIds, existing.categoryIds) && sameIds(tagIds, existing.tagIds)) {
      return { ok: true };
    }
    try {
      const assigned = await assignTerms(postId, categoryIds, tagIds, currentPost.version);
      return { ok: true, post: assigned };
    } catch (caught) {
      return { ok: false, error: actionErrorMessage(caught) };
    }
  }

  function commitBaseline(nextPost: AdminPost, nextTerms = termsFromPost(nextPost)) {
    setPost(nextPost);
    const nextForm = formFromPost(nextPost);
    setForm(nextForm);
    setCategoryIds(nextTerms.categoryIds);
    setTagIds(nextTerms.tagIds);
    setBaseline({ form: nextForm, ...nextTerms });
    setContentTouched(false);
  }

  async function handleSave(intent: SaveIntent) {
    if (saving || !editable) return;

    const nextFieldErrors: Record<string, string> = {};
    if (!form.title.trim()) {
      nextFieldErrors['title'] = 'Title is required.';
    }
    if (form.slug.length > 200) {
      nextFieldErrors['slug'] = 'Slug must be 200 characters or fewer.';
    }
    if (form.excerpt.length > 2000) {
      nextFieldErrors['excerpt'] = 'Excerpt must be 2,000 characters or fewer.';
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setNotice({ tone: 'error', text: 'Check the highlighted fields and try again.' });
      return;
    }

    // Persist exactly what is on screen: flush pending debounced keystrokes.
    const content = contentTouched ? (canvasRef.current?.flush() ?? form.content) : form.content;

    setSaving(true);
    setNotice(null);
    setFieldErrors({});
    setConflict(false);

    try {
      // Publishing an unchanged draft needs no write: transition at the current
      // version (the API bumps it). Avoids a pointless extra revision.
      if (intent === 'publish' && !isNew && post && post.status === 'DRAFT' && !dirty) {
        const published = await transitionPost(post.id, 'publish', post.version);
        commitBaseline(published);
        setNotice({ tone: 'success', text: 'Content published.' });
        return;
      }

      if (isNew) {
        const created = await createPost({
          type,
          title: form.title.trim(),
          ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
          excerpt: form.excerpt.trim() ? form.excerpt : null,
          content,
        });
        const termsResult = await saveTerms(created.id, created);
        if (!termsResult.ok) {
          setCreatedPost(created);
          setNotice({
            tone: 'warning',
            text: `Draft created, but category/tag assignment failed: ${termsResult.error ?? 'unknown error'}. Open the draft to retry.`,
          });
          return;
        }
        let finalPost = termsResult.post ?? created;
        if (intent === 'publish') {
          finalPost = await transitionPost(finalPost.id, 'publish', finalPost.version);
        }
        setNotice({
          tone: 'success',
          text: intent === 'publish' ? 'Content published.' : 'Content created.',
        });
        navigate(editContentPath(type, finalPost.id));
        return;
      }

      if (!post) return;
      const updated = await updatePost(post.id, {
        baseVersion: post.version,
        title: form.title.trim(),
        ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
        excerpt: form.excerpt.trim() ? form.excerpt : null,
        content,
      });
      const termsResult = await saveTerms(updated.id, updated);
      const serverTerms = termsFromPost(updated);

      if (!termsResult.ok) {
        setPost(updated);
        setForm(formFromPost(updated));
        setBaseline({ form: formFromPost(updated), ...serverTerms });
        setContentTouched(false);
        setNotice({
          tone: 'warning',
          text: `Content saved, but category/tag assignment failed: ${termsResult.error ?? 'unknown error'}. Retry saving to assign terms.`,
        });
        return;
      }

      let finalPost = termsResult.post ?? updated;
      let message = 'Changes saved.';
      if (intent === 'publish') {
        if (finalPost.status !== 'PUBLISHED') {
          finalPost = await transitionPost(finalPost.id, 'publish', finalPost.version);
        }
        message = 'Content published.';
      }
      commitBaseline(finalPost);
      setNotice({ tone: 'success', text: message });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'VERSION_CONFLICT') {
        setConflict(true);
        setNotice({
          tone: 'error',
          text: 'This content changed since you loaded it. Reload the latest version before saving again.',
        });
      } else {
        const nextErrors = fieldErrorsFrom(caught);
        setFieldErrors(nextErrors);
        setNotice({
          tone: 'error',
          text:
            Object.keys(nextErrors).length > 0
              ? 'The server rejected some fields. Check the highlighted values.'
              : actionErrorMessage(caught),
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function runTransition(action: TransitionAction) {
    if (!post || dirty) return;
    if (action === 'trash' && !window.confirm(`Move “${post.title}” to the trash?`)) {
      return;
    }
    setTransitioning(action);
    setNotice(null);
    try {
      const updated = await transitionPost(post.id, action, post.version);
      commitBaseline(updated);
      setNotice({ tone: 'success', text: ACTION_SUCCESS[action] });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setTransitioning(null);
    }
  }

  function reloadLatest() {
    if (dirty && !window.confirm('Discard your unsaved changes and reload the latest version?')) {
      return;
    }
    setConflict(false);
    setNotice(null);
    setReloadKey((value) => value + 1);
  }

  if (loading) {
    return <Skeleton label="Loading content…" lines={8} />;
  }

  if (loadError) {
    return (
      <ErrorState
        title="Could not load content"
        message={loadError}
        onRetry={() => setReloadKey((value) => value + 1)}
      />
    );
  }

  if (!isNew && !post) {
    return <ErrorState title="Content unavailable" message="This content could not be loaded." />;
  }

  if (!editable && isNew) {
    return (
      <EmptyState
        title="No permission"
        message="Your role cannot create content. Ask an administrator if you need an editorial role."
      />
    );
  }

  if (!editable) {
    return (
      <>
        <PageHeader
          eyebrow={type === 'post' ? 'Post' : 'Page'}
          title={post?.title ?? 'Content'}
          description="Read-only view. Your role can read this content but cannot edit it."
          actions={
            <a
              className="button secondary-button"
              href={listPath(type)}
              onClick={(event) => {
                event.preventDefault();
                navigate(listPath(type));
              }}
            >
              Back to {type === 'post' ? 'posts' : 'pages'}
            </a>
          }
        />
        {post ? (
          <article className="content-card">
            <div className="meta-grid">
              <div>
                <span className="meta-label">Status</span>
                <StatusBadge status={post.status} />
              </div>
              <div>
                <span className="meta-label">Slug</span>
                <code>{post.slug}</code>
              </div>
              <div>
                <span className="meta-label">Updated</span>
                {formatDateTime(post.updatedAt)}
              </div>
              <div>
                <span className="meta-label">Published</span>
                {formatDateTime(post.publishedAt)}
              </div>
            </div>
            {post.excerpt ? <p className="lede">{post.excerpt}</p> : null}
            <div className="read-only-content">{post.content || 'No content yet.'}</div>
            <p className="note">
              Content is shown as stored. Ask an administrator for an editorial role to edit it.
            </p>
          </article>
        ) : null}
      </>
    );
  }

  const transitions = post ? availableTransitions(user, post) : [];
  // Publish lives in the top bar; the sidebar carries the remaining lifecycle
  // actions so one action never renders twice with the same accessible name.
  const sidebarTransitions = transitions.filter((action) => action !== 'publish');
  const canPublishNew = ['administrator', 'editor', 'author'].includes(user.role);
  const title = isNew
    ? `New ${type}`
    : post?.status === 'TRASHED'
      ? `Edit trashed ${type}`
      : `Edit ${type}`;
  const statusLabel = post
    ? post.status === 'DRAFT'
      ? 'Draft'
      : post.status === 'PUBLISHED'
        ? 'Published'
        : 'Trashed'
    : 'New';
  // One primary action per state; a secondary "Save draft" only exists when
  // the primary action is Publish. This mirrors the WordPress editor and keeps
  // every accessible action name unique.
  const draftCanPublish = isNew ? canPublishNew : Boolean(post && transitions.includes('publish'));
  const primaryAction: { label: string; intent: SaveIntent } =
    draftCanPublish && (isNew || post?.status === 'DRAFT')
      ? { label: 'Publish', intent: 'publish' }
      : { label: isNew ? 'Save draft' : 'Update', intent: 'save' };
  const secondarySave = primaryAction.intent === 'publish' ? 'Save draft' : null;

  return (
    <>
      <div className="editor-screen">
        <header className="editor-topbar">
          <div className="editor-topbar-left">
            <a
              className="editor-back"
              href={listPath(type)}
              aria-label={`Back to ${type === 'post' ? 'posts' : 'pages'}`}
              onClick={(event) => {
                event.preventDefault();
                if (
                  dirty &&
                  !window.confirm('You have unsaved changes. Leave this page without saving?')
                ) {
                  return;
                }
                navigate(listPath(type));
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M15 5l-7 7 7 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
            <div className="editor-topbar-titles">
              <span className="editor-eyebrow">{type === 'post' ? 'Post' : 'Page'}</span>
              <h1 className="editor-topbar-title">{title}</h1>
            </div>
          </div>
          <div className="editor-topbar-actions">
            <span
              className={`editor-save-state${dirty ? ' is-dirty' : ''}`}
              role="status"
              aria-live="polite"
            >
              {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}
            </span>
            <StatusBadge status={post?.status ?? 'DRAFT'} />
            {secondarySave ? (
              <button
                type="button"
                className="button secondary-button editor-save-button"
                onClick={() => void handleSave('save')}
                disabled={saving || Boolean(conflict)}
                aria-busy={saving}
              >
                {saving ? 'Saving…' : secondarySave}
              </button>
            ) : null}
            <button
              type="button"
              className="button primary-button editor-publish-button"
              onClick={() => void handleSave(primaryAction.intent)}
              disabled={saving || Boolean(conflict)}
              aria-busy={saving}
            >
              {saving ? 'Saving…' : primaryAction.label}
            </button>
            <button
              type="button"
              className="button secondary-button editor-sidebar-toggle"
              aria-expanded={sidebarOpen}
              aria-controls="editor-document-settings"
              onClick={() => setSidebarOpen((open) => !open)}
            >
              Settings
            </button>
          </div>
        </header>

        {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}
        {conflict ? (
          <div className="conflict-panel">
            <p>A newer version exists on the server. Reload it before editing again.</p>
            <button type="button" className="button secondary-button" onClick={reloadLatest}>
              Reload latest version
            </button>
          </div>
        ) : null}
        {termsError ? (
          <Notice
            notice={{ tone: 'warning', text: termsError }}
            onDismiss={() => setTermsError(null)}
          />
        ) : null}

        {createdPost ? (
          <div className="content-card">
            <h2>Draft created</h2>
            <p>
              “{createdPost.title}” was created, but assigning categories or tags failed. Open the
              draft to retry the assignment.
            </p>
            <a
              className="button primary-button"
              href={editContentPath(type, createdPost.id)}
              onClick={(event) => {
                event.preventDefault();
                navigate(editContentPath(type, createdPost.id));
              }}
            >
              Open draft
            </a>
          </div>
        ) : (
          <div className="editor-layout">
            <div className="editor-main-column">
              <Suspense fallback={<Skeleton label="Loading block editor…" lines={6} />}>
                <BlockCanvas
                  ref={canvasRef}
                  initialContent={form.content}
                  onChange={updateContent}
                  onDirty={() => setContentTouched(true)}
                  titleSlot={
                    <>
                      <input
                        className="editor-title-input"
                        id="content-title"
                        name="title"
                        type="text"
                        maxLength={300}
                        placeholder="Add title"
                        aria-label="Title"
                        aria-invalid={Boolean(fieldErrors['title'])}
                        aria-describedby={fieldErrors['title'] ? 'content-title-error' : undefined}
                        value={form.title}
                        onChange={(event) => updateForm('title', event.target.value)}
                      />
                      <FieldError id="content-title-error" message={fieldErrors['title']} />
                    </>
                  }
                />
              </Suspense>
              <p className="editor-status-line">
                {post
                  ? `Status: ${statusLabel} · Version ${post.version} · Updated ${formatDateTime(post.updatedAt)}`
                  : 'New content is created as a draft. Use Publish when it is ready.'}
              </p>
            </div>

            {sidebarOpen ? (
              <button
                type="button"
                className="editor-sidebar-backdrop"
                aria-label="Close document settings"
                onClick={() => setSidebarOpen(false)}
              />
            ) : null}

            <aside
              id="editor-document-settings"
              className={`editor-sidebar${sidebarOpen ? ' is-open' : ''}`}
              aria-label="Document settings"
            >
              <div className="editor-sidebar-head">
                <h2>Document</h2>
                <button
                  type="button"
                  className="editor-sidebar-close"
                  aria-label="Close settings panel"
                  onClick={() => setSidebarOpen(false)}
                >
                  ×
                </button>
              </div>

              <section className="editor-panel" aria-labelledby="publish-heading">
                <h3 id="publish-heading">Publishing</h3>
                {post ? (
                  <>
                    <dl className="meta-list">
                      <div>
                        <dt>Status</dt>
                        <dd>
                          <StatusBadge status={post.status} />
                        </dd>
                      </div>
                      <div>
                        <dt>Author</dt>
                        <dd>{post.authorId === user.id ? 'You' : 'Another user'}</dd>
                      </div>
                      <div>
                        <dt>Published</dt>
                        <dd>{formatDateTime(post.publishedAt)}</dd>
                      </div>
                      <div>
                        <dt>Updated</dt>
                        <dd>{formatDateTime(post.updatedAt)}</dd>
                      </div>
                      <div>
                        <dt>Version</dt>
                        <dd>{post.version}</dd>
                      </div>
                    </dl>
                    {dirty ? (
                      <p className="field-help">Save your changes before changing status.</p>
                    ) : null}
                    <div className="side-actions">
                      {sidebarTransitions.map((action) => (
                        <button
                          key={action}
                          type="button"
                          className="button secondary-button"
                          disabled={transitioning !== null || dirty}
                          aria-busy={transitioning === action}
                          onClick={() => void runTransition(action)}
                        >
                          {transitioning === action
                            ? `${ACTION_LABELS[action]}…`
                            : ACTION_LABELS[action]}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="field-help">
                    The content is created as a draft. Publish it from the top bar when it is ready.
                  </p>
                )}
              </section>

              <section className="editor-panel" aria-labelledby="document-fields-heading">
                <h3 id="document-fields-heading">Details</h3>
                <div className="field">
                  <label htmlFor="content-slug">Slug</label>
                  <input
                    id="content-slug"
                    name="slug"
                    type="text"
                    maxLength={200}
                    value={form.slug}
                    onChange={(event) => updateForm('slug', event.target.value)}
                    aria-invalid={Boolean(fieldErrors['slug'])}
                    aria-describedby={
                      fieldErrors['slug']
                        ? 'content-slug-help content-slug-error'
                        : 'content-slug-help'
                    }
                  />
                  <p id="content-slug-help" className="field-help">
                    Leave blank to derive from the title when creating. On edit, leave unchanged to
                    keep the current slug.
                  </p>
                  <FieldError id="content-slug-error" message={fieldErrors['slug']} />
                </div>

                <div className="field">
                  <label htmlFor="content-excerpt">Excerpt</label>
                  <textarea
                    id="content-excerpt"
                    name="excerpt"
                    rows={3}
                    maxLength={2000}
                    value={form.excerpt}
                    onChange={(event) => updateForm('excerpt', event.target.value)}
                    aria-invalid={Boolean(fieldErrors['excerpt'])}
                    aria-describedby={fieldErrors['excerpt'] ? 'content-excerpt-error' : undefined}
                  />
                  <FieldError id="content-excerpt-error" message={fieldErrors['excerpt']} />
                </div>
              </section>

              <section className="editor-panel" aria-labelledby="terms-heading">
                <h3 id="terms-heading">Categories and tags</h3>
                {!canAssign ? (
                  <p className="field-help">Your role cannot assign taxonomy terms.</p>
                ) : termsError ? (
                  <p className="field-help">Terms are unavailable. Content can still be saved.</p>
                ) : (
                  <>
                    <fieldset className="term-group">
                      <legend>Categories</legend>
                      {categories.length === 0 ? (
                        <p className="field-help">No categories exist yet.</p>
                      ) : (
                        categories.map((term) => (
                          <label key={term.id} className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={categoryIds.includes(term.id)}
                              onChange={() =>
                                setCategoryIds((current) => toggleId(current, term.id))
                              }
                            />
                            <span>{term.name}</span>
                          </label>
                        ))
                      )}
                    </fieldset>
                    <fieldset className="term-group">
                      <legend>Tags</legend>
                      {tags.length === 0 ? (
                        <p className="field-help">No tags exist yet.</p>
                      ) : (
                        tags.map((term) => (
                          <label key={term.id} className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={tagIds.includes(term.id)}
                              onChange={() => setTagIds((current) => toggleId(current, term.id))}
                            />
                            <span>{term.name}</span>
                          </label>
                        ))
                      )}
                    </fieldset>
                  </>
                )}
              </section>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
