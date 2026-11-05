import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { postPath } from '@mernpress/contracts';
import {
  actionErrorMessage,
  assignTerms,
  createPost,
  discardAutosave,
  fetchAutosave,
  fetchPost,
  fetchRevision,
  fetchRevisions,
  fetchTerms,
  restoreRevision,
  rotatePreviewToken,
  revokePreviewToken,
  saveAutosave,
  fetchSchedule,
  schedulePost,
  unschedulePost,
  transitionPost,
  updatePost,
  ApiError,
  type AdminPost,
  type AdminRevision,
  type AdminRevisionDetail,
  type AdminTerm,
  type AuthUser,
  type AutosaveSnapshot,
  type AutosaveState,
  type ContentType,
  type FeaturedImage,
  type MediaItem,
  type PostFormat,
  type TransitionAction,
  listMedia,
} from './api.js';
import {
  EmptyState,
  ErrorState,
  FieldError,
  Notice,
  Skeleton,
  PageHeader,
  type NoticeMessage,
} from './components.js';
import { formatDateTime, formatRelativeTime } from './format.js';
import { useUnsavedChanges } from './navigation-guard.js';
import {
  availableTransitions,
  canAssignTerms,
  canCreateContent,
  canEditPost,
  canLockStructure,
} from './roles.js';
import { editContentPath, listPath, navigate } from './router.js';
import {
  readEditorPreferences,
  writeEditorPreferences,
  type EditorPreferences,
} from './editorPreferences.js';
import type { BlockCanvasHandle } from './editor/BlockCanvas.js';
import { NotesPanel } from './editor/NotesPanel.js';
import { usePostNotes } from './editor/usePostNotes.js';

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
  featuredMediaId: string | null;
  format: PostFormat;
  structureLocked: boolean;
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
const POST_FORMAT_OPTIONS: Array<{ value: PostFormat; label: string }> = [
  { value: 'standard', label: 'Standard' },
  { value: 'aside', label: 'Aside' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'link', label: 'Link' },
  { value: 'image', label: 'Image' },
  { value: 'quote', label: 'Quote' },
  { value: 'status', label: 'Status' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'chat', label: 'Chat' },
];

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

function EditorStatus({ status }: { status: 'DRAFT' | 'PUBLISHED' | 'TRASHED' }) {
  const label = status === 'PUBLISHED' ? 'Published' : status === 'DRAFT' ? 'Draft' : 'Trashed';
  return (
    <span className={`editor-status-value is-${status.toLowerCase()}`}>
      <span className="editor-status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Pingbacks and trackbacks need an inbound XML-RPC endpoint or link
 * verification. This build exposes neither, so the control stays visible but
 * disabled and explained, exactly where WordPress shows its checkbox.
 */
function PingsField() {
  return (
    <div className="publish-field">
      <span className="publish-label">Pings</span>
      <div className="publish-value">
        <label
          className="checkbox-row is-disabled"
          title="Pingbacks and trackbacks require an inbound XML-RPC endpoint, which this build does not expose."
        >
          <input type="checkbox" checked={false} readOnly disabled />
          <span className="editor-link-value">Not available</span>
        </label>
        <p className="field-help">
          Pingbacks and trackbacks are disabled for security; comments are unaffected.
        </p>
      </div>
    </div>
  );
}

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
  const [featuredMedia, setFeaturedMedia] = useState<FeaturedImage | null>(null);
  const [format, setFormat] = useState<PostFormat>('standard');
  const [structureLocked, setStructureLocked] = useState(false);
  const [permalinkPattern, setPermalinkPattern] = useState('/posts/%postname%/');
  const [featuredPickerOpen, setFeaturedPickerOpen] = useState(false);
  const [featuredPickerItems, setFeaturedPickerItems] = useState<MediaItem[] | null>(null);
  const [featuredPickerSearch, setFeaturedPickerSearch] = useState('');
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
  const [sideTab, setSideTab] = useState<'post' | 'block' | 'notes'>('post');
  const [revisions, setRevisions] = useState<AdminRevision[] | null>(null);
  const [revisionsError, setRevisionsError] = useState<string | null>(null);
  const [viewingRevision, setViewingRevision] = useState<AdminRevisionDetail | null>(null);
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [editorDialog, setEditorDialog] = useState<
    null | 'code' | 'shortcuts' | 'welcome' | 'preferences'
  >(null);
  const [preferences, setPreferences] = useState<EditorPreferences>(() => readEditorPreferences());
  const [previewBusy, setPreviewBusy] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleInput, setScheduleInput] = useState('');
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [recoveryAutosave, setRecoveryAutosave] = useState<AutosaveState | null>(null);
  const canvasRef = useRef<BlockCanvasHandle>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const saveShortcutRef = useRef<() => void>(() => {});

  const editable = isNew ? canCreateContent(user) : post ? canEditPost(user, post) : false;
  const canAssign = editable && canAssignTerms(user);
  const notesPostId = post && !createdPost && editable ? post.id : null;
  const postNotes = usePostNotes(notesPostId);

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
      !sameIds(tagIds, baseline.tagIds) ||
      (featuredMedia?.id ?? null) !== baseline.featuredMediaId ||
      format !== baseline.format ||
      structureLocked !== baseline.structureLocked
    );
  }, [
    baseline,
    categoryIds,
    contentTouched,
    createdPost,
    editable,
    featuredMedia,
    form,
    isNew,
    tagIds,
    format,
    structureLocked,
  ]);

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
    const current = readEditorPreferences();
    if (current.showWelcomeGuide) setEditorDialog('welcome');
    // Only on editor mount, not whenever preferences change.
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
        setFeaturedMedia(loaded.featuredMedia ?? null);
        setFormat(loaded.format);
        setStructureLocked(loaded.structureLocked);
        setBaseline({
          form: nextForm,
          ...nextTerms,
          featuredMediaId: loaded.featuredMedia?.id ?? null,
          format: loaded.format,
          structureLocked: loaded.structureLocked,
        });
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

  // Public URL preview uses the configured permalink structure. Loaded lazily
  // for published posts so document editing performs no extra request.
  useEffect(() => {
    if (!post || post.type !== 'post' || post.status !== 'PUBLISHED') return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/public/site', { cache: 'no-store' });
        if (!active || !response?.ok) return;
        const body = (await response.json()) as { permalinkPattern?: unknown };
        if (typeof body.permalinkPattern === 'string') {
          setPermalinkPattern(body.permalinkPattern);
        }
      } catch {
        // The fallback pattern still produces a usable link.
      }
    })();
    return () => {
      active = false;
    };
  }, [post?.id, post?.status, post?.type]);

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

  // Load any pending first-publish schedule for drafts (P8-04).
  useEffect(() => {
    if (!post || createdPost || post.status !== 'DRAFT') {
      setScheduledAt(null);
      return;
    }
    let active = true;
    fetchSchedule(post.id)
      .then((state) => {
        if (active) {
          setScheduledAt(state.scheduledAt);
        }
      })
      .catch(() => {
        // Scheduling is optional; failure must not block editing.
      });
    return () => {
      active = false;
    };
  }, [post?.id, post?.status, post?.version, createdPost]);

  // Load picker items when the featured-image picker opens.
  useEffect(() => {
    if (!featuredPickerOpen) {
      return;
    }
    let active = true;
    setFeaturedPickerItems(null);
    listMedia({ perPage: 12 })
      .then((result) => {
        if (active) {
          setFeaturedPickerItems(result.items);
        }
      })
      .catch(() => {
        if (active) {
          setFeaturedPickerItems([]);
        }
      });
    return () => {
      active = false;
    };
  }, [featuredPickerOpen]);

  // --- Autosave (P8-02) ---
  // One autosave per post, stored server-side as a special revision row. The
  // posts row is never touched, so autosave cannot clobber newer edits; the
  // recovery path is an explicit user action (Restore) that goes through the
  // normal version-checked update.

  // On load, offer recovery when an autosave newer than the post exists.
  useEffect(() => {
    if (!post || createdPost) {
      return;
    }
    let active = true;
    fetchAutosave(post.id)
      .then(({ autosave, postUpdatedAt }) => {
        if (!active || !autosave) {
          return;
        }
        if (new Date(autosave.createdAt).getTime() > new Date(postUpdatedAt).getTime()) {
          setRecoveryAutosave(autosave);
        }
      })
      .catch(() => {
        // Autosave recovery must never block editing.
      });
    return () => {
      active = false;
    };
    // Only on post load, not on every save — a save discards the autosave.
  }, [post?.id, createdPost]);

  function buildAutosaveSnapshot(): AutosaveSnapshot {
    return {
      title: form.title,
      excerpt: form.excerpt.trim() ? form.excerpt : null,
      content: form.content,
      ...seoPayload(form),
    };
  }

  // Debounced autosave: 30 s after the first change, then whenever the user
  // has been idle for 30 s with unsaved changes. Never while saving, in a
  // conflict state, or on new posts (no post row to attach to).
  const autosaveStateRef = useRef<{ dirty: boolean; saving: boolean; conflict: boolean }>({
    dirty,
    saving,
    conflict: Boolean(conflict),
  });
  autosaveStateRef.current = { dirty, saving, conflict: Boolean(conflict) };
  const snapshotRef = useRef(buildAutosaveSnapshot);
  snapshotRef.current = buildAutosaveSnapshot;

  useEffect(() => {
    if (!post || createdPost || !dirty || saving || conflict) {
      return;
    }
    const timer = setTimeout(() => {
      const current = autosaveStateRef.current;
      if (!current.dirty || current.saving || current.conflict || !post) {
        return;
      }
      saveAutosave(post.id, snapshotRef.current()).catch(() => {
        // Autosave failures are silent by design; the next tick retries.
      });
    }, 30_000);
    return () => clearTimeout(timer);
  }, [post?.id, dirty, saving, conflict, createdPost, form, contentTouched]);

  function handleRestoreAutosave(): void {
    if (!recoveryAutosave || !post) {
      return;
    }
    setForm((current) => ({
      ...current,
      title: recoveryAutosave.title,
      excerpt: recoveryAutosave.excerpt ?? '',
      content: recoveryAutosave.content,
      seoTitle: recoveryAutosave.seoTitle ?? '',
      seoDescription: recoveryAutosave.seoDescription ?? '',
      canonicalUrl: recoveryAutosave.canonicalUrl ?? '',
      robots: recoveryAutosave.robots ?? '',
      ogTitle: recoveryAutosave.ogTitle ?? '',
      ogDescription: recoveryAutosave.ogDescription ?? '',
    }));
    setContentTouched(true);
    setNotice({
      tone: 'success',
      text: 'Autosave restored into the editor. Save to make it permanent.',
    });
    setRecoveryAutosave(null);
  }

  function handleDiscardAutosave(): void {
    if (!post) {
      setRecoveryAutosave(null);
      return;
    }
    setRecoveryAutosave(null);
    discardAutosave(post.id).catch(() => undefined);
  }

  function toLocalDateTimeInput(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours(),
    )}:${pad(date.getMinutes())}`;
  }

  async function handleScheduleSave(): Promise<void> {
    if (!post || !scheduleInput) {
      return;
    }
    setScheduleBusy(true);
    setNotice(null);
    try {
      const state = await schedulePost(
        post.id,
        new Date(scheduleInput).toISOString(),
        post.version,
      );
      setScheduledAt(state.scheduledAt);
      setScheduleOpen(false);
      setNotice({
        tone: 'success',
        text: `Scheduled for ${formatDateTime(state.scheduledAt ?? '')}. The post publishes automatically.`,
      });
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setScheduleBusy(false);
    }
  }

  async function handleUnschedule(): Promise<void> {
    if (!post) {
      return;
    }
    setScheduleBusy(true);
    setNotice(null);
    try {
      await unschedulePost(post.id, post.version);
      setScheduledAt(null);
      setScheduleOpen(false);
      setNotice({ tone: 'success', text: 'Schedule cancelled.' });
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setScheduleBusy(false);
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
      // Prefer the rendered web preview; the API JSON endpoint is the
      // machine-readable fallback (no site_url configured clients).
      let url = post.previewToken ? `/preview/${post.previewToken}` : null;
      if (!url) {
        const rotated = await rotatePreviewToken(post.id);
        url = rotated.previewUrl ?? rotated.previewPath;
      }
      if (url) {
        if (preferences.previewTarget === 'same-tab') {
          window.location.assign(url);
        } else {
          window.open(url, '_blank', 'noopener');
        }
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
    setFeaturedMedia(nextPost.featuredMedia ?? null);
    setFormat(nextPost.format);
    setStructureLocked(nextPost.structureLocked);
    setBaseline({
      form: nextForm,
      ...nextTerms,
      featuredMediaId: nextPost.featuredMedia?.id ?? null,
      format: nextPost.format,
      structureLocked: nextPost.structureLocked,
    });
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
      const protocol = (() => {
        try {
          return new URL(canonical).protocol;
        } catch {
          return null;
        }
      })();
      if (protocol !== 'http:' && protocol !== 'https:') {
        nextFieldErrors['canonicalUrl'] = 'Canonical URL must be a valid http(s) URL.';
      }
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setNotice({ tone: 'error', text: 'Check the highlighted fields and try again.' });
      return;
    }

    // Persist exactly what is on screen: flush pending debounced keystrokes.
    // Locking (or unlocking) also flushes, so the structure baseline is stored
    // in the editor's canonical serialization. Without this, locking raw
    // imported markup would reject the first text edit because the editor
    // normalizes attributes (e.g. it drops a heading's default level).
    const lockChanged = post ? structureLocked !== post.structureLocked : false;
    const content =
      contentTouched || lockChanged ? (canvasRef.current?.flush() ?? form.content) : form.content;

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
          format,
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
        format,
        structureLocked,
        // Only send when changed; undefined keeps the server-side value.
        ...((featuredMedia?.id ?? null) !== (baseline?.featuredMediaId ?? null)
          ? { featuredMediaId: featuredMedia?.id ?? null }
          : {}),
      });
      const termsResult = await saveTerms(updated.id, updated);
      const serverTerms = termsFromPost(updated);

      if (!termsResult.ok) {
        setPost(updated);
        setForm(formFromPost(updated));
        setFeaturedMedia(updated.featuredMedia ?? null);
        setFormat(updated.format);
        setStructureLocked(updated.structureLocked);
        setBaseline({
          form: formFromPost(updated),
          ...serverTerms,
          featuredMediaId: updated.featuredMedia?.id ?? null,
          format: updated.format,
          structureLocked: updated.structureLocked,
        });
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
      // A successful save supersedes any autosave held for this post.
      setRecoveryAutosave(null);
      discardAutosave(finalPost.id).catch(() => undefined);
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
                <EditorStatus status={post.status} />
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
            post?.status === 'PUBLISHED'
              ? 'Save'
              : post?.status === 'TRASHED'
                ? 'Update'
                : 'Save draft',
          intent: 'save',
        };
  const secondarySave = primaryAction.intent === 'publish' ? 'Save draft' : null;
  const wordCount = `${form.title} ${form.content}`
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 200));
  return (
    <>
      <div className={`editor-screen editor-density-${preferences.density}`}>
        <header className="editor-topbar">
          <div className="editor-topbar-left">
            <a
              className="editor-back"
              href={listPath(type)}
              aria-label={`Back to ${type === 'post' ? 'posts' : 'pages'}`}
              title={`Back to ${type === 'post' ? 'posts' : 'pages'}`}
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
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </a>
            <div className="editor-topbar-tools" ref={setToolbarSlot} />
            {/* Kept for assistive tech and tests; the visible document title
                lives in the canvas, like the reference editor. */}
            <h1 className="screen-reader-text">{title}</h1>
          </div>
          <div className="editor-topbar-center">
            <button
              type="button"
              className="editor-document-pill"
              onClick={() => titleRef.current?.focus()}
            >
              <span className="editor-document-title">{form.title || 'No title'}</span>
              <span className="editor-document-type">· {type === 'post' ? 'Post' : 'Page'}</span>
            </button>
            <span className="screen-reader-text" role="status" aria-live="polite">
              {saving
                ? 'Saving…'
                : isNew && !dirty
                  ? 'Not saved yet'
                  : dirty
                    ? 'Unsaved changes'
                    : 'Saved'}
            </span>
          </div>
          <div className="editor-topbar-actions">
            {createdPost ? null : (
              <>
                {secondarySave ? (
                  <button
                    type="button"
                    className="editor-topbar-text-button"
                    onClick={() => void handleSave('save')}
                    disabled={saving || Boolean(conflict)}
                    aria-busy={saving}
                    aria-keyshortcuts="Control+S Meta+S"
                    aria-label={secondarySave ?? 'Save draft'}
                    title="Save draft (Ctrl/Cmd+S)"
                  >
                    <svg
                      className="editor-topbar-save-icon"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      aria-hidden="true"
                    >
                      <path d="M5 3h11l3 3v15H5z" />
                      <path d="M8 3v6h8V3" />
                      <path d="M8 21v-6h8v6" />
                    </svg>
                    <span className="editor-topbar-save-label">
                      {saving ? 'Saving…' : secondarySave}
                    </span>
                  </button>
                ) : null}
              </>
            )}
            {post?.status === 'PUBLISHED' ? (
              <a
                className="editor-topbar-icon-button editor-topbar-view-link"
                href={
                  post.type === 'post'
                    ? postPath(permalinkPattern, {
                        id: post.id,
                        slug: post.slug,
                        publishedAt: post.publishedAt,
                        createdAt: post.updatedAt,
                        categorySlug: post.terms.categories[0]?.slug ?? null,
                      })
                    : `/${post.slug}`
                }
                target="_blank"
                rel="noreferrer"
                aria-label="View post"
                title="View post"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <path d="M14 4h6v6" />
                  <path d="M20 4 11 13" />
                  <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
                </svg>
              </a>
            ) : null}
            {!createdPost && post?.status !== 'TRASHED' ? (
              <button
                type="button"
                className="editor-topbar-icon-button editor-topbar-view"
                onClick={() => void handlePreview()}
                disabled={previewBusy || saving || !post}
                aria-busy={previewBusy}
                aria-label="Preview"
                title="Preview"
              >
                {previewBusy ? (
                  <span className="editor-spinner" aria-hidden="true" />
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    aria-hidden="true"
                  >
                    <rect x="3" y="4" width="18" height="12" rx="1" />
                    <line x1="8" y1="20" x2="16" y2="20" />
                    <line x1="12" y1="16" x2="12" y2="20" />
                  </svg>
                )}
              </button>
            ) : null}
            {notesPostId ? (
              <button
                type="button"
                className={`editor-topbar-icon-button editor-topbar-notes${
                  sidebarOpen && sideTab === 'notes' ? ' is-active' : ''
                }`}
                aria-label="All notes"
                title="All notes"
                onClick={() => {
                  setSidebarOpen(true);
                  setSideTab('notes');
                  window.setTimeout(() => {
                    const panel = document.getElementById('editor-notes-panel');
                    if (panel && typeof panel.scrollIntoView === 'function') {
                      panel.scrollIntoView({ block: 'start' });
                    }
                  }, 0);
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  <line x1="8" y1="8" x2="16" y2="8" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
                {postNotes.unresolvedCount > 0 ? (
                  <span className="editor-topbar-count" aria-hidden="true">
                    {postNotes.unresolvedCount}
                  </span>
                ) : null}
              </button>
            ) : null}
            <button
              type="button"
              className={`button editor-topbar-gear${sidebarOpen ? ' is-active' : ''}`}
              aria-expanded={sidebarOpen}
              aria-controls="editor-document-settings"
              aria-label="Settings"
              title="Settings"
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="9" y1="4" x2="9" y2="20" />
              </svg>
            </button>
            {createdPost ? null : (
              <>
                <button
                  type="button"
                  className="button primary-button editor-topbar-publish"
                  onClick={() => void handleSave(primaryAction.intent)}
                  disabled={saving || Boolean(conflict) || (post?.status === 'PUBLISHED' && !dirty)}
                  aria-busy={saving}
                  aria-keyshortcuts="Control+S Meta+S"
                  title={`${primaryAction.label} (Ctrl/Cmd+S)`}
                >
                  {saving ? 'Saving…' : primaryAction.label}
                </button>
              </>
            )}
            <details className="editor-options-menu">
              <summary className="editor-topbar-icon-button" aria-label="Options" title="Options">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="5" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="12" cy="19" r="1.6" />
                </svg>
              </summary>
              <div className="editor-options-panel">
                <button type="button" onClick={() => setSidebarOpen(true)}>
                  Settings
                </button>
                <button type="button" onClick={() => setEditorDialog('code')}>
                  Code editor
                </button>
                <button type="button" onClick={() => setEditorDialog('shortcuts')}>
                  Keyboard shortcuts
                </button>
                <button type="button" onClick={() => setEditorDialog('welcome')}>
                  Welcome guide
                </button>
                <button type="button" onClick={() => setEditorDialog('preferences')}>
                  Preferences
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(form.content)
                      .then(() =>
                        setNotice({
                          tone: 'success',
                          text: 'All content copied to the clipboard.',
                        }),
                      )
                      .catch(() =>
                        setNotice({ tone: 'error', text: 'Could not copy the content.' }),
                      );
                  }}
                >
                  Copy all content
                </button>
                <button type="button" onClick={() => navigate('/plugins')}>
                  Plugins
                </button>
                {post && transitions.includes('unpublish') ? (
                  <button
                    type="button"
                    disabled={transitioning !== null || dirty}
                    onClick={() => {
                      document
                        .querySelectorAll<HTMLDetailsElement>('.editor-options-menu')
                        .forEach((details) => {
                          details.open = false;
                        });
                      void runTransition('unpublish');
                    }}
                  >
                    Switch to draft
                  </button>
                ) : null}
                {post && transitions.includes('trash') ? (
                  <button
                    type="button"
                    className="is-danger"
                    disabled={transitioning !== null || dirty}
                    onClick={() => {
                      document
                        .querySelectorAll<HTMLDetailsElement>('.editor-options-menu')
                        .forEach((details) => {
                          details.open = false;
                        });
                      void runTransition('trash');
                    }}
                  >
                    Move to trash
                  </button>
                ) : null}
              </div>
            </details>
          </div>
        </header>

        {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}
        {recoveryAutosave ? (
          <div className="autosave-recovery" role="alert">
            <p>
              A more recent autosave from {formatDateTime(recoveryAutosave.createdAt)} exists for
              this {type}.
            </p>
            <div className="autosave-recovery-actions">
              <button
                type="button"
                className="button primary-button"
                onClick={handleRestoreAutosave}
              >
                Restore autosave
              </button>
              <button
                type="button"
                className="button secondary-button"
                onClick={handleDiscardAutosave}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
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
                </div>
                {structureLocked ? (
                  <div className="editor-structure-banner" role="status">
                    <strong>Structure locked.</strong> You can edit text; adding, removing, moving
                    or restyling blocks is disabled.
                  </div>
                ) : null}
                <Suspense fallback={<Skeleton label="Loading block editor…" lines={6} />}>
                  <BlockCanvas
                    ref={canvasRef}
                    toolbarSlot={toolbarSlot}
                    initialContent={form.content}
                    onChange={updateContent}
                    onDirty={() => setContentTouched(true)}
                    structureLocked={structureLocked}
                    onStructureBlocked={() =>
                      setNotice({
                        tone: 'error',
                        text: 'The block structure is locked. You can edit text, but not add, remove, move or restyle blocks.',
                      })
                    }
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
                  {[
                    { id: 'post' as const, label: 'Post' },
                    { id: 'block' as const, label: 'Block' },
                    ...(notesPostId ? [{ id: 'notes' as const, label: 'Notes' }] : []),
                  ].map((tab) => (
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

              <div className="editor-sidebar-body">
                <div hidden={sideTab !== 'post'}>
                  <section className="editor-panel editor-summary" aria-label="Document summary">
                    <div className="editor-summary-title">
                      <span>{form.title || 'No title'}</span>
                      <span className="editor-summary-actions">
                        <button
                          type="button"
                          className="editor-summary-edit"
                          aria-label="Edit title"
                          onClick={() => titleRef.current?.focus()}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            aria-hidden="true"
                          >
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        <details className="editor-summary-menu">
                          <summary aria-label="Options">⋮</summary>
                          <div className="editor-summary-menu-panel">
                            {post ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void handlePreview();
                                  document
                                    .querySelectorAll<HTMLDetailsElement>('.editor-summary-menu')
                                    .forEach((details) => {
                                      details.open = false;
                                    });
                                }}
                              >
                                View
                              </button>
                            ) : null}
                            {post && transitions.includes('trash') ? (
                              <button
                                type="button"
                                className="is-danger"
                                disabled={transitioning !== null || dirty}
                                onClick={() => {
                                  void runTransition('trash');
                                  document
                                    .querySelectorAll<HTMLDetailsElement>('.editor-summary-menu')
                                    .forEach((details) => {
                                      details.open = false;
                                    });
                                }}
                              >
                                Move to Trash
                              </button>
                            ) : null}
                          </div>
                        </details>
                      </span>
                    </div>
                    {featuredMedia ? (
                      <div className="editor-featured-current">
                        <img
                          src={featuredMedia.derivatives['300'] ?? featuredMedia.url}
                          alt={featuredMedia.altText}
                        />
                        <div className="editor-featured-current-actions">
                          <button
                            type="button"
                            className="editor-excerpt-link"
                            onClick={() => setFeaturedPickerOpen((open) => !open)}
                          >
                            Replace image
                          </button>
                          <button
                            type="button"
                            className="editor-excerpt-link is-danger"
                            onClick={() => setFeaturedMedia(null)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="editor-featured-button"
                        onClick={() => setFeaturedPickerOpen((open) => !open)}
                      >
                        Set featured image
                      </button>
                    )}
                    {featuredPickerOpen ? (
                      <div className="featured-picker">
                        <div className="featured-picker-search">
                          <label htmlFor="featured-picker-search" className="screen-reader-text">
                            Search media
                          </label>
                          <input
                            id="featured-picker-search"
                            type="search"
                            placeholder="Search media…"
                            value={featuredPickerSearch}
                            onChange={(event) => {
                              const value = event.target.value;
                              setFeaturedPickerSearch(value);
                              setFeaturedPickerItems(null);
                              listMedia({
                                ...(value.trim() ? { search: value.trim() } : {}),
                                perPage: 12,
                              })
                                .then((result) => setFeaturedPickerItems(result.items))
                                .catch(() => setFeaturedPickerItems([]));
                            }}
                          />
                        </div>
                        {featuredPickerItems === null ? (
                          <p className="field-help">Loading media…</p>
                        ) : featuredPickerItems.length === 0 ? (
                          <p className="field-help">
                            No media found. Upload images in the Media Library first.
                          </p>
                        ) : (
                          <div
                            className="featured-picker-grid"
                            role="listbox"
                            aria-label="Media items"
                          >
                            {featuredPickerItems.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                role="option"
                                aria-selected={featuredMedia?.id === item.id}
                                className="featured-picker-item"
                                title={item.originalName}
                                onClick={() => {
                                  setFeaturedMedia({
                                    id: item.id,
                                    url: item.url,
                                    width: item.width,
                                    height: item.height,
                                    altText: item.altText,
                                    derivatives: item.derivatives,
                                  });
                                  setFeaturedPickerOpen(false);
                                }}
                              >
                                <img
                                  src={item.derivatives['300'] ?? item.url}
                                  alt={item.altText}
                                  loading="lazy"
                                />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="editor-excerpt-link"
                      onClick={() => {
                        const details =
                          document.querySelector<HTMLDetailsElement>('.editor-seo-panel');
                        if (details) {
                          details.open = true;
                          window.setTimeout(
                            () => document.getElementById('content-excerpt')?.focus(),
                            0,
                          );
                        }
                      }}
                    >
                      {form.excerpt.trim() ? 'Edit excerpt' : 'Add an excerpt…'}
                    </button>
                    {preferences.showWordCount ? (
                      <p className="editor-word-count">
                        {wordCount} {wordCount === 1 ? 'word' : 'words'}, {readingMinutes} minute
                        read time.
                      </p>
                    ) : null}
                    <p className="editor-last-edited">
                      {post
                        ? `Last edited ${formatRelativeTime(post.updatedAt)}.`
                        : 'Last edited a second ago.'}
                    </p>
                  </section>

                  <section
                    className="editor-panel publish-panel"
                    aria-label="Status and visibility"
                  >
                    {post ? (
                      <>
                        <div className="publish-field">
                          <span className="publish-label">Status</span>
                          <div className="publish-value">
                            <EditorStatus status={post.status} />
                          </div>
                        </div>
                        {post.status === 'DRAFT' ? (
                          <div className="publish-field">
                            <span className="publish-label">
                              {scheduledAt ? 'Scheduled for' : 'Publish'}
                            </span>
                            <div className="publish-value publish-schedule">
                              <span>
                                {scheduledAt ? formatDateTime(scheduledAt) : 'Immediately'}
                              </span>
                              <button
                                type="button"
                                className="button small-button edit-link"
                                aria-label="Edit schedule"
                                aria-expanded={scheduleOpen}
                                disabled={scheduleBusy || dirty}
                                onClick={() => {
                                  setScheduleInput(toLocalDateTimeInput(scheduledAt));
                                  setScheduleOpen((open) => !open);
                                }}
                              >
                                Edit
                              </button>
                            </div>
                            {scheduleOpen ? (
                              <div className="schedule-editor">
                                <label htmlFor="schedule-at" className="screen-reader-text">
                                  Schedule date and time
                                </label>
                                <input
                                  id="schedule-at"
                                  type="datetime-local"
                                  value={scheduleInput}
                                  onChange={(event) => setScheduleInput(event.target.value)}
                                />
                                <div className="schedule-actions">
                                  <button
                                    type="button"
                                    className="button primary-button small-button"
                                    disabled={scheduleBusy || !scheduleInput}
                                    onClick={() => void handleScheduleSave()}
                                  >
                                    {scheduleBusy ? 'Scheduling…' : 'Schedule'}
                                  </button>
                                  {scheduledAt ? (
                                    <button
                                      type="button"
                                      className="button secondary-button small-button"
                                      disabled={scheduleBusy}
                                      onClick={() => void handleUnschedule()}
                                    >
                                      Cancel schedule
                                    </button>
                                  ) : null}
                                </div>
                                <p className="field-help">
                                  At least one minute in the future. The post stays a draft until
                                  the scheduler publishes it.
                                </p>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="publish-field">
                            <span className="publish-label">Publish</span>
                            <div className="publish-value">
                              {formatDateTime(post.publishedAt ?? post.updatedAt)}
                            </div>
                          </div>
                        )}
                        <div className="publish-field">
                          <span className="publish-label">Slug</span>
                          <div className="publish-value">
                            <input
                              id="content-slug"
                              name="slug"
                              type="text"
                              maxLength={200}
                              className="editor-slug-input"
                              value={form.slug}
                              onChange={(event) => updateForm('slug', event.target.value)}
                              aria-label="Slug"
                              aria-invalid={Boolean(fieldErrors['slug'])}
                              aria-describedby={
                                fieldErrors['slug'] ? 'content-slug-error' : undefined
                              }
                            />
                            <FieldError id="content-slug-error" message={fieldErrors['slug']} />
                          </div>
                        </div>
                        <div className="publish-field">
                          <span className="publish-label">Author</span>
                          <div className="publish-value">
                            <span className="editor-link-value">
                              {post.author?.username ?? user.username}
                            </span>
                          </div>
                        </div>
                        <div className="publish-field">
                          <span className="publish-label">Template</span>
                          <div className="publish-value">
                            <span className="editor-link-value">
                              {post.type === 'post' ? 'Single Posts' : 'Default Template'}
                            </span>
                          </div>
                        </div>
                        <div className="publish-field">
                          <span className="publish-label">Discussion</span>
                          <div className="publish-value">
                            <span className="editor-link-value">
                              {post.commentStatus === 'closed' ? 'Closed' : 'Open'}
                            </span>
                          </div>
                        </div>
                        <PingsField />
                        <div className="publish-field">
                          <span className="publish-label">Format</span>
                          <div className="publish-value">
                            <select
                              aria-label="Format"
                              value={format}
                              onChange={(event) => setFormat(event.target.value as PostFormat)}
                              disabled={!editable}
                            >
                              {POST_FORMAT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
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
                              Move to trash
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
                      <>
                        <div className="publish-field">
                          <span className="publish-label">Status</span>
                          <div className="publish-value">
                            <EditorStatus status="DRAFT" />
                          </div>
                        </div>
                        <div className="publish-field">
                          <span className="publish-label">Publish</span>
                          <div className="publish-value">
                            <span className="editor-publish-link">Immediately</span>
                          </div>
                        </div>
                        <div className="publish-field">
                          <span className="publish-label">Slug</span>
                          <div className="publish-value">
                            <input
                              id="content-slug"
                              name="slug"
                              type="text"
                              maxLength={200}
                              className="editor-slug-input"
                              value={form.slug}
                              onChange={(event) => updateForm('slug', event.target.value)}
                              aria-label="Slug"
                              placeholder="Auto"
                              aria-invalid={Boolean(fieldErrors['slug'])}
                              aria-describedby={
                                fieldErrors['slug'] ? 'content-slug-error' : undefined
                              }
                            />
                            <FieldError id="content-slug-error" message={fieldErrors['slug']} />
                          </div>
                        </div>
                        <div className="publish-field">
                          <span className="publish-label">Author</span>
                          <div className="publish-value">
                            <span className="editor-link-value">{user.username}</span>
                          </div>
                        </div>
                        <div className="publish-field">
                          <span className="publish-label">Template</span>
                          <div className="publish-value">
                            {type === 'post' ? 'Single Posts' : 'Default Template'}
                          </div>
                        </div>
                        <div className="publish-field">
                          <span className="publish-label">Discussion</span>
                          <div className="publish-value">
                            <span className="editor-link-value">Open</span>
                          </div>
                        </div>
                        <PingsField />
                        <div className="publish-field">
                          <span className="publish-label">Format</span>
                          <div className="publish-value">
                            <select
                              aria-label="Format"
                              value={format}
                              onChange={(event) => setFormat(event.target.value as PostFormat)}
                              disabled={!editable}
                            >
                              {POST_FORMAT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <p className="field-help">
                          The content is created as a draft. Publish it from the top bar when it is
                          ready.
                        </p>
                      </>
                    )}
                  </section>

                  <section className="editor-panel" aria-label="Taxonomies">
                    {!canAssign ? (
                      <>
                        <h3>Categories and tags</h3>
                        <p className="field-help">Your role cannot assign taxonomy terms.</p>
                      </>
                    ) : termsError ? (
                      <>
                        <h3>Categories and tags</h3>
                        <p className="field-help">
                          Terms are unavailable. Content can still be saved.
                        </p>
                      </>
                    ) : (
                      <>
                        <details className="editor-term-panel">
                          <summary>Categories</summary>
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
                        </details>
                        <details className="editor-term-panel">
                          <summary>Tags</summary>
                          {tags.length === 0 ? (
                            <p className="field-help">No tags exist yet.</p>
                          ) : (
                            tags.map((term) => (
                              <label key={term.id} className="checkbox-row">
                                <input
                                  type="checkbox"
                                  checked={tagIds.includes(term.id)}
                                  onChange={() =>
                                    setTagIds((current) => toggleId(current, term.id))
                                  }
                                />
                                <span className="term-name">{term.name}</span>
                                <span aria-hidden="true" className="term-slug">
                                  {term.slug}
                                </span>
                              </label>
                            ))
                          )}
                        </details>
                      </>
                    )}
                  </section>

                  {post && !createdPost ? (
                    <section className="editor-panel" aria-labelledby="preview-token-heading">
                      <h3 id="preview-token-heading">Preview token</h3>
                      {post.previewToken ? (
                        <>
                          <p className="field-help">
                            Anyone with the token link can view this draft. Regenerating invalidates
                            the old link.
                          </p>
                          <div className="preview-token-actions">
                            <button
                              type="button"
                              className="button secondary-button small-button"
                              onClick={() => {
                                void (async () => {
                                  const rotated = await rotatePreviewToken(post.id);
                                  if (rotated.previewUrl) {
                                    const absolute = rotated.previewUrl.startsWith('http')
                                      ? rotated.previewUrl
                                      : `${window.location.origin}${rotated.previewUrl}`;
                                    void navigator.clipboard?.writeText(absolute);
                                    setNotice({ tone: 'success', text: 'Preview link copied.' });
                                  }
                                  setReloadKey((value) => value + 1);
                                })().catch((caught) =>
                                  setNotice({ tone: 'error', text: actionErrorMessage(caught) }),
                                );
                              }}
                            >
                              Regenerate link
                            </button>
                            <button
                              type="button"
                              className="button secondary-button small-button"
                              onClick={() => {
                                void revokePreviewToken(post.id)
                                  .then(() => {
                                    setNotice({ tone: 'success', text: 'Preview link revoked.' });
                                    setReloadKey((value) => value + 1);
                                  })
                                  .catch((caught) =>
                                    setNotice({ tone: 'error', text: actionErrorMessage(caught) }),
                                  );
                              }}
                            >
                              Revoke
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="field-help">
                            Create a shareable link to preview this draft.
                          </p>
                          <button
                            type="button"
                            className="button secondary-button small-button"
                            onClick={() => {
                              void (async () => {
                                const rotated = await rotatePreviewToken(post.id);
                                if (rotated.previewUrl) {
                                  const absolute = rotated.previewUrl.startsWith('http')
                                    ? rotated.previewUrl
                                    : `${window.location.origin}${rotated.previewUrl}`;
                                  void navigator.clipboard?.writeText(absolute);
                                  setNotice({
                                    tone: 'success',
                                    text: 'Preview link created and copied.',
                                  });
                                }
                                setReloadKey((value) => value + 1);
                              })().catch((caught) =>
                                setNotice({ tone: 'error', text: actionErrorMessage(caught) }),
                              );
                            }}
                          >
                            Create preview link
                          </button>
                        </>
                      )}
                    </section>
                  ) : null}

                  <details className="editor-term-panel editor-seo-panel">
                    <summary>SEO</summary>
                    <div className="editor-seo-content">
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
                              fieldErrors['excerpt']
                                ? 'content-excerpt-error'
                                : 'content-excerpt-help'
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
                          <FieldError
                            id="content-seo-title-error"
                            message={fieldErrors['seoTitle']}
                          />
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
                            aria-describedby={
                              fieldErrors['robots'] ? 'content-robots-error' : undefined
                            }
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
                          <FieldError
                            id="content-og-title-error"
                            message={fieldErrors['ogTitle']}
                          />
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
                              fieldErrors['ogDescription']
                                ? 'content-og-description-error'
                                : undefined
                            }
                          />
                          <FieldError
                            id="content-og-description-error"
                            message={fieldErrors['ogDescription']}
                          />
                        </div>
                      </section>
                    </div>
                  </details>

                  <section
                    className="editor-panel editor-structure-panel"
                    aria-labelledby="structure-lock-heading"
                  >
                    <h3 id="structure-lock-heading">Safe client editing</h3>
                    <p className="field-help">
                      Freeze the block structure so a client can rewrite text without adding,
                      removing, moving or restyling blocks. The server rejects structural changes
                      while the lock is on.
                    </p>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={structureLocked}
                        onChange={(event) => setStructureLocked(event.target.checked)}
                        disabled={!editable || createdPost || !canLockStructure(user)}
                      />
                      <span>Lock block structure</span>
                    </label>
                    {!canLockStructure(user) ? (
                      <p className="field-help">
                        Only administrators and editors can change this lock.
                      </p>
                    ) : null}
                    {structureLocked ? (
                      <p className="editor-structure-status">Structure locked — text edits only.</p>
                    ) : null}
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

                <div hidden={sideTab !== 'block'}>
                  <section className="editor-panel" aria-labelledby="block-heading">
                    <h3 id="block-heading">Block</h3>
                    <p className="field-help">
                      Block settings are available in the canvas inspector. Select a block, then
                      open the inspector.
                    </p>
                    <button
                      type="button"
                      className="button secondary-button"
                      onClick={() => canvasRef.current?.openInspector()}
                    >
                      Open block settings
                    </button>
                  </section>
                </div>

                <div hidden={sideTab !== 'notes'}>
                  <NotesPanel postId={notesPostId} state={postNotes} />
                </div>
              </div>
            </aside>
          </div>
        )}
        <div className="editor-footer">{type === 'post' ? 'Post' : 'Page'}</div>
      </div>

      {editorDialog ? (
        <div
          className="editor-dialog-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setEditorDialog(null);
          }}
        >
          <div
            className={`editor-dialog is-${editorDialog}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-dialog-title"
          >
            <div className="editor-dialog-head">
              <h2 id="editor-dialog-title">
                {editorDialog === 'code'
                  ? 'Code editor'
                  : editorDialog === 'shortcuts'
                    ? 'Keyboard shortcuts'
                    : editorDialog === 'preferences'
                      ? 'Preferences'
                      : 'Welcome guide'}
              </h2>
              <button
                type="button"
                className="button secondary-button"
                onClick={() => setEditorDialog(null)}
              >
                Close
              </button>
            </div>
            {editorDialog === 'code' ? (
              <>
                <p className="field-help">
                  Edit the raw block markup. The server validates and sanitizes it when you save;
                  invalid markup is rejected rather than stored.
                </p>
                <textarea
                  className="editor-code-textarea"
                  aria-label="Raw block markup"
                  value={form.content}
                  onChange={(event) => updateForm('content', event.target.value)}
                  spellCheck={false}
                  rows={18}
                />
              </>
            ) : editorDialog === 'shortcuts' ? (
              <table className="editor-shortcuts">
                <caption className="screen-reader-text">Editor keyboard shortcuts</caption>
                <tbody>
                  {[
                    ['Ctrl/Cmd + S', 'Save the draft'],
                    ['Ctrl/Cmd + K', 'Open the admin command palette'],
                    ['Esc', 'Close a dialog, panel or the options menu'],
                    ['Tab / Shift + Tab', 'Move between editor controls'],
                  ].map(([keys, action]) => (
                    <tr key={keys}>
                      <th scope="row">{keys}</th>
                      <td>{action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : editorDialog === 'preferences' ? (
              <div className="editor-preferences">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={preferences.showWelcomeGuide}
                    onChange={(event) => {
                      const next = { ...preferences, showWelcomeGuide: event.target.checked };
                      setPreferences(next);
                      writeEditorPreferences(next);
                    }}
                  />
                  <span>Show the Welcome guide when the editor loads</span>
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={preferences.showWordCount}
                    onChange={(event) => {
                      const next = { ...preferences, showWordCount: event.target.checked };
                      setPreferences(next);
                      writeEditorPreferences(next);
                    }}
                  />
                  <span>Show the word count and reading time</span>
                </label>
                <label className="editor-preference-field">
                  <span>Density</span>
                  <select
                    value={preferences.density}
                    onChange={(event) => {
                      const next = {
                        ...preferences,
                        density: event.target.value === 'compact' ? 'compact' : 'comfortable',
                      } as EditorPreferences;
                      setPreferences(next);
                      writeEditorPreferences(next);
                    }}
                  >
                    <option value="comfortable">Comfortable</option>
                    <option value="compact">Compact</option>
                  </select>
                </label>
                <label className="editor-preference-field">
                  <span>Preview opens in</span>
                  <select
                    value={preferences.previewTarget}
                    onChange={(event) => {
                      const next = {
                        ...preferences,
                        previewTarget: event.target.value === 'same-tab' ? 'same-tab' : 'new-tab',
                      } as EditorPreferences;
                      setPreferences(next);
                      writeEditorPreferences(next);
                    }}
                  >
                    <option value="new-tab">A new tab</option>
                    <option value="same-tab">The same tab</option>
                  </select>
                </label>
              </div>
            ) : (
              <div className="editor-welcome">
                <p>The editor is arranged like WordPress:</p>
                <ul>
                  <li>The top bar holds the inserter, undo/redo, document overview and Save.</li>
                  <li>The canvas is the document; select a block to see its toolbar.</li>
                  <li>The right sidebar holds the document and block settings.</li>
                  <li>
                    Options contains the code editor, keyboard shortcuts, copy all content, plugins
                    and the status actions.
                  </li>
                </ul>
                <p className="field-help">
                  Content is stored as WordPress-compatible block markup and rendered by the server.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}

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
              <pre className="revision-content">{viewingRevision.content}</pre>
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
