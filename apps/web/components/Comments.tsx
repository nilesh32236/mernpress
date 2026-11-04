'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

interface PublicComment {
  id: string;
  parentId: string | null;
  authorName: string;
  authorUrl: string | null;
  content: string;
  createdAt: string;
}

function formatCommentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function CommentItem({
  comment,
  byParent,
  onReply,
}: {
  comment: PublicComment;
  byParent: Map<string, PublicComment[]>;
  onReply: (comment: PublicComment) => void;
}) {
  const replies = byParent.get(comment.id) ?? [];
  return (
    <li className="comment-item">
      <article className="comment-body">
        <span className="comment-avatar" aria-hidden="true">
          {comment.authorName.slice(0, 1).toUpperCase()}
        </span>
        <div className="comment-main">
          <div className="comment-meta">
            {comment.authorUrl ? (
              <a href={comment.authorUrl} rel="external nofollow ugc" target="_blank">
                {comment.authorName}
              </a>
            ) : (
              <strong>{comment.authorName}</strong>
            )}
            <time dateTime={comment.createdAt}>{formatCommentDate(comment.createdAt)}</time>
            <button type="button" className="comment-reply-link" onClick={() => onReply(comment)}>
              Reply
            </button>
          </div>
          <p className="comment-content">{comment.content}</p>
        </div>
      </article>
      {replies.length > 0 ? (
        <ol className="children">
          {replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} byParent={byParent} onReply={onReply} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

export default function Comments({
  postId,
  postTitle,
}: {
  postId: string;
  postTitle: string;
}) {
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
      const response = await fetch(
        `/api/public/posts/${encodeURIComponent(postId)}/comments`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            authorName,
            authorEmail,
            authorUrl: authorUrl.trim() ? authorUrl.trim() : null,
            content,
            parentId,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? 'We could not post your comment.');
      }
      setComments((current) => [...current, body as PublicComment]);
      setContent('');
      setParentId(null);
      setNotice(
        body?.status === 'PENDING'
          ? 'Your comment is awaiting moderation.'
          : 'Your comment has been posted.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not post your comment.');
    } finally {
      setSubmitting(false);
    }
  }

  const replyTo = parentId ? comments.find((comment) => comment.id === parentId) : null;

  return (
    <section className="site-content comments-area" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="comments-title">
        {comments.length === 0
          ? 'Comments'
          : `${comments.length} ${comments.length === 1 ? 'thought' : 'thoughts'} on “${postTitle}”`}
      </h2>
      {loading ? (
        <p role="status" className="status">
          Loading comments…
        </p>
      ) : loadError ? (
        <p role="status" className="status">
          We couldn&rsquo;t load comments right now.
        </p>
      ) : roots.length > 0 ? (
        <ol className="comment-list">
          {roots.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              byParent={replies}
              onReply={(target) => setParentId(target.id)}
            />
          ))}
        </ol>
      ) : null}

      <div className="comment-respond">
        <h3 className="comment-reply-title">
          {replyTo ? `Reply to ${replyTo.authorName}` : 'Leave a Reply'}
        </h3>
        {replyTo ? (
          <button type="button" className="comment-cancel-reply" onClick={() => setParentId(null)}>
            Cancel reply
          </button>
        ) : null}
        <form className="comment-form" onSubmit={handleSubmit}>
          <p className="comment-notes">
            Your email address will not be published. Required fields are marked <span>*</span>.
          </p>
          <p className="comment-form-author">
            <label htmlFor="comment-author">Name *</label>
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
            <label htmlFor="comment-email">Email *</label>
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
            <label htmlFor="comment-url">Website</label>
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
            <label htmlFor="comment-content">Comment *</label>
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
              {submitting ? 'Posting…' : 'Post Comment'}
            </button>
          </p>
        </form>
      </div>
    </section>
  );
}
