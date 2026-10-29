import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  actionErrorMessage,
  assignTerms,
  createPost,
  fetchPost,
  fetchRevision,
  fetchRevisions,
  fetchTerms,
  restoreRevision,
  rotatePreviewToken,
  transitionPost,
  updatePost,
  ApiError,
  type AdminPost,
  type AdminRevision,
  type AdminRevisionDetail,
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
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  robots: string;
  ogTitle: string;
  ogDescription: string;
}

interface Baseline {
  form: FormState;
  categoryIds: string[];
  tagIds: string[];
}

const EMPTY_FORM: FormState = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  seoTitle: '',
  seoDescription: '',
  canonicalUrl: '',
  robots: '',
  ogTitle: '',
  ogDescription: '',
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
    seoTitle: post.seoTitle ?? '',
    seoDescription: post.seoDescription ?? '',
    canonicalUrl: post.canonicalUrl ?? '',
    robots: post.robots ?? '',
    ogTitle: post.ogTitle ?? '',
    ogDescription: post.ogDescription ?? '',
  };
}

function seoPayload(form: FormState) {
  return {
    seoTitle: form.seoTitle.trim() ? form.seoTitle : null,
    seoDescription: form.seoDescription.trim() ? form.seoDescription : null,
    canonicalUrl: form.canonicalUrl.trim() ? form.canonicalUrl.trim() : null,
    robots: form.robots.trim() ? form.robots : null,
    ogTitle: form.ogTitle.trim() ? form.ogTitle : null,
    ogDescription: form.ogDescription.trim() ? form.ogDescription : null,
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
  const [sideTab, setSideTab] = useState<'post' | 'seo' | 'block'>('post');
  const [revisions, setRevisions] = useState<AdminRevision[] | null>(null);
  const [revisionsError, setRevisionsError] = useState<string | null>(null);
  const [viewingRevision, setViewingRevision] = useState<AdminRevisionDetail | null>(null);
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const canvasRef = useRef<BlockCanvasHandle>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const saveShortcutRef = useRef<() => void>(() => {});

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
        form.seoTitle.trim() !== '' ||
        form.seoDescription.trim() !== '' ||
        form.canonicalUrl.trim() !== '' ||
        form.robots.trim() !== '' ||
        form.ogTitle.trim() !== '' ||
        form.ogDescription.trim() !== '' ||
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
      form.seoTitle !== baseline.form.seoTitle ||
      form.seoDescription !== baseline.form.seoDescription ||
      form.canonicalUrl !== baseline.form.canonicalUrl ||
      form.robots !== baseline.form.robots ||
      form.ogTitle !== baseline.form.ogTitle ||
      form.ogDescription !== baseline.form.ogDescription ||
      !sameIds(categoryIds, baseline.categoryIds) ||
      !sameIds(tagIds, baseline.tagIds)
    );
  }, [baseline, categoryIds, contentTouched, createdPost, editable, form, isNew, tagIds]);

  useUnsavedChanges(dirty, 'You have unsaved changes. Leave this page without saving?');

  // The title behaves like WordPress's: it wraps and grows with long titles
  // instead of scrolling inside a single-line input.
  useLayoutEffect(() => {
    const element = titleRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [form.title]);

  useEffect(() => {
    function resizeTitle() {
      const element = titleRef.current;
      if (!element) return;
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight}px`;
    }
    window.addEventListener('resize', resizeTitle);
    return () => window.removeEventListener('resize', resizeTitle);
  }, []);

  // Escape closes the settings drawer, matching the shell's mobile navigation.
  useEffect(() => {
    if (!sidebarOpen) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [sidebarOpen]);

  // Ctrl/Cmd+S saves without triggering the browser's page-save dialog. The
  // latest render's handler is kept in a ref so the listener registers once.
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveShortcutRef.current();
      }
    }
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, []);

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

  // The revision list loads on demand (the panel is collapsed by default), so
  // opening the editor never costs an extra request.
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  useEffect(() => {
    if (!revisionsOpen || !post || createdPost) {
      return;
    }
    let active = true;
    setRevisionsError(null);
    fetchRevisions(post.id)
      .then((result) => {
        if (active) {
          setRevisions(result);
        }
      })
      .catch((caught) => {
        if (active) {
          setRevisionsError(actionErrorMessage(caught));
        }
      });
    return () => {
      active = false;
    };
  }, [revisionsOpen, post?.id, post?.version, createdPost]);

  async function handleViewRevision(revision: AdminRevision): Promise<void> {
    if (!post) {
      return;
    }
    setRevisionBusy(true);
    try {
      const detail = await fetchRevision(post.id, revision.id);
      setViewingRevision(detail);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setRevisionBusy(false);
    }
  }

  async function handleRestoreRevision(): Promise<void> {
    if (!post || !viewingRevision) {
      return;
    }
    if (
      !window.confirm(
        `Restore revision #${viewingRevision.revisionNumber}? The current content is snapshotted first, so the restore can be undone.`,
      )
    ) {
      return;
    }
    setRevisionBusy(true);
    setNotice(null);
    try {
      const updated = await restoreRevision(post.id, viewingRevision.id, post.version);
      setViewingRevision(null);
      setNotice({
        tone: 'success',
        text: `Revision #${viewingRevision.revisionNumber} restored.`,
      });
      setReloadKey((value) => value + 1);
      void updated;
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setRevisionBusy(false);
    }
  }

  async function handlePreview(): Promise<void> {
    if (!post) {
      return;
    }
    if (dirty && !window.confirm('Preview shows the last saved version. Continue?')) {
      return;
    }
    setPreviewBusy(true);
    try {
      let path = post.previewToken ? `/api/public/preview/${post.previewToken}` : null;
      if (!path) {
        const rotated = await rotatePreviewToken(post.id);
        path = rotated.previewPath;
      }
      if (path) {
        window.open(path, '_blank', 'noopener');
      }
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setPreviewBusy(false);
    }
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
    if (saving || !editable || createdPost) return;

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
    if (form.seoTitle.length > 300) {
      nextFieldErrors['seoTitle'] = 'SEO title must be 300 characters or fewer.';
    }
    if (form.seoDescription.length > 500) {
      nextFieldErrors['seoDescription'] = 'SEO description must be 500 characters or fewer.';
    }
    if (form.ogTitle.length > 300) {
      nextFieldErrors['ogTitle'] = 'Social title must be 300 characters or fewer.';
    }
    if (form.ogDescription.length > 500) {
      nextFieldErrors['ogDescription'] = 'Social description must be 500 characters or fewer.';
    }
    if (form.robots.length > 100) {
      nextFieldErrors['robots'] = 'Robots must be 100 characters or fewer.';
    }
    const canonical = form.canonicalUrl.trim();
    if (canonical.length > 2048) {
      nextFieldErrors['canonicalUrl'] = 'Canonical URL must be 2,048 characters or fewer.';
    } else if (canonical) {
      let valid = false;
      try {
        const parsed = new URL(canonical);
        valid = parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        valid = false;
      }
      if (!valid) {
        nextFieldErrors['canonicalUrl'] = 'Canonical URL must be a valid http(s) URL.';
      }
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
          ...seoPayload(form),
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
          try {
            finalPost = await transitionPost(finalPost.id, 'publish', finalPost.version);
          } catch (publishError) {
            // The draft exists; keep the form replaced by the "Draft created"
            // panel so a retry cannot create a duplicate post.
            setCreatedPost(finalPost);
            setNotice({
              tone: 'warning',
              text: `Draft created, but publishing failed: ${actionErrorMessage(publishError)}. Open the draft to retry.`,
            });
            return;
          }
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
        ...seoPayload(form),
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
      // Persist the new content/version in local state before the transition:
      // if publishing fails, a retry must not reuse a stale baseVersion.
      commitBaseline(finalPost);
      let message = 'Changes saved.';
      if (intent === 'publish' && finalPost.status !== 'PUBLISHED') {
        finalPost = await transitionPost(finalPost.id, 'publish', finalPost.version);
        commitBaseline(finalPost);
        message = 'Content published.';
      }
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

  saveShortcutRef.current = () => {
    if (saving || conflict || !editable) return;
    void handleSave('save');
  };

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
      : {
          label:
            post?.status === 'PUBLISHED' || post?.status === 'TRASHED' ? 'Update' : 'Save draft',
          intent: 'save',
        };
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
              {saving
                ? 'Saving…'
                : isNew && !dirty
                  ? 'Not saved yet'
                  : dirty
                    ? 'Unsaved changes'
                    : 'Saved'}
            </span>
            <StatusBadge status={post?.status ?? 'DRAFT'} />
            {post && !createdPost && post.status !== 'TRASHED' ? (
              <button
                type="button"
                className="button secondary-button editor-preview-button"
                onClick={() => void handlePreview()}
                disabled={previewBusy || saving}
                aria-busy={previewBusy}
              >
                {previewBusy ? 'Opening…' : 'Preview'}
              </button>
            ) : null}
            {createdPost ? null : (
              <>
                {secondarySave ? (
                  <button
                    type="button"
                    className="button secondary-button editor-save-button"
                    onClick={() => void handleSave('save')}
                    disabled={saving || Boolean(conflict)}
                    aria-busy={saving}
                    aria-keyshortcuts="Control+S Meta+S"
                    title="Save draft (Ctrl/Cmd+S)"
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
                  aria-keyshortcuts="Control+S Meta+S"
                  title={`${primaryAction.label} (Ctrl/Cmd+S)`}
                >
                  {saving ? 'Saving…' : primaryAction.label}
                </button>
              </>
            )}
            <button
              type="button"
              className="button secondary-button editor-sidebar-toggle"
              aria-expanded={sidebarOpen}
              aria-controls="editor-document-settings"
              onClick={() => setSidebarOpen((open) => !open)}
            >
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
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
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
              “{createdPost.title}” was created as a draft, but a follow-up step failed. Open the
              draft to retry.
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
              <div className="editor-document">
                <div className="editor-title-block">
                  <textarea
                    ref={titleRef}
                    className="editor-title-input editor-title-textarea"
                    id="content-title"
                    name="title"
                    rows={1}
                    maxLength={300}
                    placeholder="Add title"
                    aria-label="Title"
                    aria-invalid={Boolean(fieldErrors['title'])}
                    aria-describedby={fieldErrors['title'] ? 'content-title-error' : undefined}
                    value={form.title}
                    onChange={(event) => updateForm('title', event.target.value)}
                  />
                  <FieldError id="content-title-error" message={fieldErrors['title']} />
                  <div className="editor-permalink">
                    {post ? (
                      <>
                        <span>https://example.com/</span>
                        <code>{form.slug || post.slug}</code>
                      </>
                    ) : (
                      <>
                        <span>https://example.com/</span>
                        <span className="permalink-edit">
                          {form.slug || '(derived from title)'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Suspense fallback={<Skeleton label="Loading block editor…" lines={6} />}>
                  <BlockCanvas
                    ref={canvasRef}
                    initialContent={form.content}
                    onChange={updateContent}
                    onDirty={() => setContentTouched(true)}
                  />
                </Suspense>
              </div>
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
                <div
                  className="editor-side-tabs"
                  role="tablist"
                  aria-label="Document settings views"
                >
                  {(
                    [
                      { id: 'post', label: 'Post' },
                      { id: 'seo', label: 'SEO' },
                      { id: 'block', label: 'Block' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={sideTab === tab.id}
                      className={`editor-side-tab${sideTab === tab.id ? ' is-active' : ''}`}
                      onClick={() => setSideTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="editor-sidebar-close"
                  aria-label="Close settings panel"
                  onClick={() => setSidebarOpen(false)}
                >
                  ×
                </button>
              </div>

              <div hidden={sideTab !== 'post'}>
                <section className="editor-panel publish-panel" aria-labelledby="publish-heading">
                  <h3 id="publish-heading">Publish</h3>
                  {post ? (
                    <>
                      <div className="publish-field">
                        <span className="publish-label">Status</span>
                        <div className="publish-value">
                          <StatusBadge status={post.status} />
                          {transitions.includes('publish') || transitions.includes('unpublish') ? (
                            <button
                              type="button"
                              className="button small-button edit-link"
                              disabled={transitioning !== null || dirty}
                              aria-label={post.status === 'DRAFT' ? 'Change status' : 'Unpublish'}
                              onClick={() =>
                                void runTransition(
                                  post.status === 'DRAFT' ? 'publish' : 'unpublish',
                                )
                              }
                            >
                              Edit
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="publish-field">
                        <span className="publish-label">Visibility</span>
                        <div className="publish-value">Public</div>
                      </div>
                      <div className="publish-field">
                        <span className="publish-label">Publish immediately</span>
                        <div className="publish-value">
                          {formatDateTime(post.publishedAt ?? post.updatedAt)}
                        </div>
                      </div>
                      {post.status !== 'TRASHED' && transitions.includes('trash') ? (
                        <div className="publish-field">
                          <button
                            type="button"
                            className="button delete-link"
                            disabled={transitioning !== null || dirty}
                            onClick={() => void runTransition('trash')}
                          >
                            Move to Trash
                          </button>
                        </div>
                      ) : null}
                      {post.status === 'TRASHED' && transitions.includes('restore') ? (
                        <div className="publish-field">
                          <button
                            type="button"
                            className="button secondary-button"
                            disabled={transitioning !== null || dirty}
                            onClick={() => void runTransition('restore')}
                          >
                            Restore
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="field-help">
                      The content is created as a draft. Publish it from the top bar when it is
                      ready.
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
                      Leave blank to derive from the title when creating. On edit, leave unchanged
                      to keep the current slug.
                    </p>
                    <FieldError id="content-slug-error" message={fieldErrors['slug']} />
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
                              <span className="term-name">{term.name}</span>
                              <span aria-hidden="true" className="term-slug">
                                {term.slug}
                              </span>
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
                              <span className="term-name">{term.name}</span>
                              <span aria-hidden="true" className="term-slug">
                                {term.slug}
                              </span>
                            </label>
                          ))
                        )}
                      </fieldset>
                    </>
                  )}
                </section>

                {post && !createdPost ? (
                  <section className="editor-panel" aria-labelledby="revisions-heading">
                    <div className="revisions-panel-head">
                      <h3 id="revisions-heading">Revisions</h3>
                      <button
                        type="button"
                        className="button secondary-button revisions-toggle"
                        aria-expanded={revisionsOpen}
                        onClick={() => setRevisionsOpen((open) => !open)}
                      >
                        {revisionsOpen ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {!revisionsOpen ? null : revisionsError ? (
                      <p className="field-help">Revisions are unavailable.</p>
                    ) : revisions === null ? (
                      <p className="field-help">Loading revisions…</p>
                    ) : revisions.length === 0 ? (
                      <p className="field-help">Revisions appear after you save changes.</p>
                    ) : (
                      <ul className="revision-list">
                        {revisions.map((revision) => (
                          <li key={revision.id}>
                            <button
                              type="button"
                              className="revision-link"
                              disabled={revisionBusy}
                              onClick={() => void handleViewRevision(revision)}
                            >
                              <span className="revision-number">#{revision.revisionNumber}</span>
                              <span className="revision-date">
                                {formatDateTime(revision.createdAt)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ) : null}
              </div>

              <div hidden={sideTab !== 'seo'}>
                <section className="editor-panel" aria-labelledby="seo-heading">
                  <h3 id="seo-heading">SEO</h3>
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
                      aria-describedby={
                        fieldErrors['excerpt'] ? 'content-excerpt-error' : 'content-excerpt-help'
                      }
                    />
                    <p id="content-excerpt-help" className="field-help">
                      Shown as the meta description in search results.
                    </p>
                    <FieldError id="content-excerpt-error" message={fieldErrors['excerpt']} />
                  </div>
                  <div className="field">
                    <label htmlFor="content-seo-title">SEO title</label>
                    <input
                      id="content-seo-title"
                      name="seoTitle"
                      type="text"
                      maxLength={300}
                      value={form.seoTitle}
                      onChange={(event) => updateForm('seoTitle', event.target.value)}
                      aria-invalid={Boolean(fieldErrors['seoTitle'])}
                      aria-describedby={
                        fieldErrors['seoTitle']
                          ? 'content-seo-title-help content-seo-title-error'
                          : 'content-seo-title-help'
                      }
                    />
                    <p id="content-seo-title-help" className="field-help">
                      Defaults to the post title when empty.
                    </p>
                    <FieldError id="content-seo-title-error" message={fieldErrors['seoTitle']} />
                  </div>
                  <div className="field">
                    <label htmlFor="content-seo-description">SEO description</label>
                    <textarea
                      id="content-seo-description"
                      name="seoDescription"
                      rows={3}
                      maxLength={500}
                      value={form.seoDescription}
                      onChange={(event) => updateForm('seoDescription', event.target.value)}
                      aria-invalid={Boolean(fieldErrors['seoDescription'])}
                      aria-describedby={
                        fieldErrors['seoDescription']
                          ? 'content-seo-description-help content-seo-description-error'
                          : 'content-seo-description-help'
                      }
                    />
                    <p id="content-seo-description-help" className="field-help">
                      Defaults to the excerpt when empty.
                    </p>
                    <FieldError
                      id="content-seo-description-error"
                      message={fieldErrors['seoDescription']}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="content-canonical-url">Canonical URL</label>
                    <input
                      id="content-canonical-url"
                      name="canonicalUrl"
                      type="url"
                      value={form.canonicalUrl}
                      onChange={(event) => updateForm('canonicalUrl', event.target.value)}
                      aria-invalid={Boolean(fieldErrors['canonicalUrl'])}
                      aria-describedby={
                        fieldErrors['canonicalUrl']
                          ? 'content-canonical-url-help content-canonical-url-error'
                          : 'content-canonical-url-help'
                      }
                    />
                    <p id="content-canonical-url-help" className="field-help">
                      Optional. Overrides the default public URL.
                    </p>
                    <FieldError
                      id="content-canonical-url-error"
                      message={fieldErrors['canonicalUrl']}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="content-robots">Robots</label>
                    <select
                      id="content-robots"
                      name="robots"
                      value={form.robots}
                      onChange={(event) => updateForm('robots', event.target.value)}
                      aria-invalid={Boolean(fieldErrors['robots'])}
                      aria-describedby={fieldErrors['robots'] ? 'content-robots-error' : undefined}
                    >
                      <option value="">Site default (index, follow)</option>
                      <option value="noindex, follow">noindex, follow</option>
                      <option value="index, nofollow">index, nofollow</option>
                      <option value="noindex, nofollow">noindex, nofollow</option>
                    </select>
                    <FieldError id="content-robots-error" message={fieldErrors['robots']} />
                  </div>
                  <div className="field">
                    <label htmlFor="content-og-title">Social title</label>
                    <input
                      id="content-og-title"
                      name="ogTitle"
                      type="text"
                      maxLength={300}
                      value={form.ogTitle}
                      onChange={(event) => updateForm('ogTitle', event.target.value)}
                      aria-invalid={Boolean(fieldErrors['ogTitle'])}
                      aria-describedby={
                        fieldErrors['ogTitle']
                          ? 'content-og-title-help content-og-title-error'
                          : 'content-og-title-help'
                      }
                    />
                    <p id="content-og-title-help" className="field-help">
                      Defaults to the SEO title when empty.
                    </p>
                    <FieldError id="content-og-title-error" message={fieldErrors['ogTitle']} />
                  </div>
                  <div className="field">
                    <label htmlFor="content-og-description">Social description</label>
                    <textarea
                      id="content-og-description"
                      name="ogDescription"
                      rows={2}
                      maxLength={500}
                      value={form.ogDescription}
                      onChange={(event) => updateForm('ogDescription', event.target.value)}
                      aria-invalid={Boolean(fieldErrors['ogDescription'])}
                      aria-describedby={
                        fieldErrors['ogDescription'] ? 'content-og-description-error' : undefined
                      }
                    />
                    <FieldError
                      id="content-og-description-error"
                      message={fieldErrors['ogDescription']}
                    />
                  </div>
                </section>
              </div>

              <div hidden={sideTab !== 'block'}>
                <section className="editor-panel" aria-labelledby="block-heading">
                  <h3 id="block-heading">Block</h3>
                  <p className="field-help">Select a block in the canvas to see its settings.</p>
                </section>
              </div>
            </aside>
          </div>
        )}
      </div>

      {viewingRevision ? (
        <div
          className="revision-modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setViewingRevision(null);
            }
          }}
        >
          <div
            className="revision-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="revision-modal-title"
          >
            <div className="revision-modal-head">
              <h2 id="revision-modal-title">
                Revision #{viewingRevision.revisionNumber} —{' '}
                {formatDateTime(viewingRevision.createdAt)}
              </h2>
              <button
                type="button"
                className="button secondary-button"
                onClick={() => setViewingRevision(null)}
              >
                Close
              </button>
            </div>
            <div className="revision-modal-body">
              <p className="revision-field-label">Title</p>
              <p className="revision-field-value">{viewingRevision.title}</p>
              {viewingRevision.excerpt ? (
                <>
                  <p className="revision-field-label">Excerpt</p>
                  <p className="revision-field-value">{viewingRevision.excerpt}</p>
                </>
              ) : null}
              <p className="revision-field-label">Content (raw block markup)</p>
              <pre className="revision-content" tabIndex={0}>
                {viewingRevision.content}
              </pre>
            </div>
            <div className="revision-modal-actions">
              <button
                type="button"
                className="button primary-button"
                disabled={revisionBusy}
                aria-busy={revisionBusy}
                onClick={() => void handleRestoreRevision()}
              >
                {revisionBusy ? 'Restoring…' : 'Restore this revision'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
