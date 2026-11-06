'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { DEFAULT_THEME_STRINGS, type ThemeStrings } from '@mernpress/contracts';

interface PublicComment {
  id: string;
  parentId: string | null;
  authorName: string;
  authorUrl: string | null;
  content: string;
  createdAt: string;
}

import { formatPublicDate } from '@/lib/date';

function formatCommentDate(value: string, locale: string): string {
  return formatPublicDate(value, locale) ?? '';
}

function CommentItem({
  comment,
  byParent,
  onReply,
  showAvatars,
  strings,
}: {
  comment: PublicComment;
  byParent: Map<string, PublicComment[]>;
  onReply: (comment: PublicComment) => void;
  showAvatars: boolean;
  strings: ThemeStrings;
}) {
  const replies = byParent.get(comment.id) ?? [];
  return (
    <li className="comment-item">
      <article className="comment-body">
        {showAvatars ? (
          <span className="comment-avatar" aria-hidden="true">
            {comment.authorName.slice(0, 1).toUpperCase()}
          </span>
        ) : null}
        <div className="comment-main">
          <div className="comment-meta">
            {comment.authorUrl ? (
              <a href={comment.authorUrl} rel="external nofollow ugc" target="_blank">
                {comment.authorName}
              </a>
            ) : (
              <strong>{comment.authorName}</strong>
            )}
            <time dateTime={comment.createdAt}>
              {formatCommentDate(comment.createdAt, strings.dateLocale)}
            </time>
            <button type="button" className="comment-reply-link" onClick={() => onReply(comment)}>
              {strings.reply}
            </button>
          </div>
          <p className="comment-content">{comment.content}</p>
        </div>
      </article>
      {replies.length > 0 ? (
        <ol className="children">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              byParent={byParent}
              onReply={onReply}
              showAvatars={showAvatars}
              strings={strings}
            />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

export default function Comments({
  postId,
  postTitle,
  strings = DEFAULT_THEME_STRINGS,
}: {
  postId: string;
  postTitle: string;
  strings?: ThemeStrings;
}) {
  const [showAvatars, setShowAvatars] = useState(true);
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [authorUrl, setAuthorUrl] = useState('');
  const [content, setContent] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/public/site')
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { showAvatars?: boolean } | null) => {
        if (active && body && body.showAvatars === false) setShowAvatars(false);
      })
      .catch(() => {
        // Keep the local initials fallback.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`/api/public/posts/${encodeURIComponent(postId)}/comments`)
      .then(async (response) => {
        if (!response.ok) throw new Error('failed');
        return (await response.json()) as { items: PublicComment[] };
      })
      .then((body) => {
        if (active) setComments(body.items);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [postId]);

  const roots = useMemo(() => comments.filter((comment) => comment.parentId === null), [comments]);
  const replies = useMemo(() => {
    const map = new Map<string, PublicComment[]>();
    for (const comment of comments) {
      if (!comment.parentId) continue;
      const list = map.get(comment.parentId) ?? [];
      list.push(comment);
      map.set(comment.parentId, list);
    }
    return map;
  }, [comments]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/public/posts/${encodeURIComponent(postId)}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          authorName,
          authorEmail,
          authorUrl: authorUrl.trim() ? authorUrl.trim() : null,
          content,
          parentId,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? strings.commentFailed);
      }
      if (body.status === 'APPROVED') {
        setComments((current) => [...current, body as PublicComment]);
      }
      setContent('');
      setParentId(null);
      setNotice(body?.status === 'PENDING' ? strings.commentPending : strings.commentPosted);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : strings.commentFailed);
    } finally {
      setSubmitting(false);
    }
  }

  const replyTo = parentId ? comments.find((comment) => comment.id === parentId) : null;

  return (
    <section className="site-content comments-area" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="comments-title">
        {comments.length === 0
          ? strings.comments
          : `${comments.length} ${comments.length === 1 ? strings.thoughtOn : strings.thoughtsOn} “${postTitle}”`}
      </h2>
      {loading ? (
        <p role="status" className="status">
          {strings.loadingComments}
        </p>
      ) : loadError ? (
        <p role="status" className="status">
          {strings.commentsUnavailable}
        </p>
      ) : roots.length > 0 ? (
        <ol className="comment-list">
          {roots.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              byParent={replies}
              onReply={(target) => setParentId(target.id)}
              showAvatars={showAvatars}
              strings={strings}
            />
          ))}
        </ol>
      ) : null}

      <div className="comment-respond">
        <h3 className="comment-reply-title">
          {replyTo ? `${strings.replyTo} ${replyTo.authorName}` : strings.leaveReply}
        </h3>
        {replyTo ? (
          <button type="button" className="comment-cancel-reply" onClick={() => setParentId(null)}>
            {strings.cancelReply}
          </button>
        ) : null}
        <form className="comment-form" onSubmit={handleSubmit}>
          <p className="comment-notes">{strings.commentNotes}</p>
          <p className="comment-form-author">
            <label htmlFor="comment-author">{strings.nameLabel}</label>
            <input
              id="comment-author"
              name="author"
              type="text"
              maxLength={200}
              value={authorName}
              onChange={(event) => setAuthorName(event.target.value)}
              required
            />
          </p>
          <p className="comment-form-email">
            <label htmlFor="comment-email">{strings.emailLabel}</label>
            <input
              id="comment-email"
              name="email"
              type="email"
              maxLength={254}
              value={authorEmail}
              onChange={(event) => setAuthorEmail(event.target.value)}
              required
            />
          </p>
          <p className="comment-form-url">
            <label htmlFor="comment-url">{strings.websiteLabel}</label>
            <input
              id="comment-url"
              name="url"
              type="url"
              maxLength={2048}
              value={authorUrl}
              onChange={(event) => setAuthorUrl(event.target.value)}
            />
          </p>
          <p className="comment-form-comment">
            <label htmlFor="comment-content">{strings.commentLabel}</label>
            <textarea
              id="comment-content"
              name="comment"
              rows={6}
              maxLength={10_000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              required
            />
          </p>
          {notice ? (
            <p className="comment-notice" role="status">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="comment-error" role="alert">
              {error}
            </p>
          ) : null}
          <p className="form-submit">
            <button type="submit" className="submit" disabled={submitting}>
              {submitting ? strings.posting : strings.postComment}
            </button>
          </p>
        </form>
      </div>
    </section>
  );
}
