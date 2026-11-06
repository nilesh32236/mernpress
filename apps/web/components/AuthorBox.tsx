import Link from 'next/link';
import type { PublicAuthorSummary } from '@/lib/api';
import { DEFAULT_THEME_STRINGS, type ThemeStrings } from '@mernpress/contracts';

function displayName(author: PublicAuthorSummary): string {
  const preferred = author.displayName?.trim();
  return preferred && preferred.length > 0 ? preferred : author.username;
}

/** Two letters at most, so the avatar stays legible at 64px. */
function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0]!.toUpperCase());
  return letters.join('');
}

/**
 * Author box for single posts.
 *
 * Uses the profile fields the author already maintains (display name, bio,
 * website) and a local initials avatar: no Gravatar or other third-party
 * request, so reading a post does not disclose the visitor to another service.
 * The archive link uses `rel="author"`; the external website is opened safely
 * and is authored by the account owner (validated http(s) server-side).
 */
export default function AuthorBox({
  author,
  strings = DEFAULT_THEME_STRINGS,
}: {
  author: PublicAuthorSummary;
  strings?: ThemeStrings;
}) {
  const name = displayName(author);
  const avatar = initials(name);
  const bio = author.bio?.trim();
  return (
    <section className="entry-wide author-box" aria-labelledby="author-box-heading">
      <h2 id="author-box-heading" className="author-box-heading">
        {strings.aboutAuthor}
      </h2>
      <div className="author-box-body">
        <span className="author-avatar" aria-hidden="true">
          {avatar}
        </span>
        <div className="author-box-text">
          <p className="author-box-name">
            <Link rel="author" href={`/author/${encodeURIComponent(author.username)}`}>
              {name}
            </Link>
          </p>
          {bio ? <p className="author-box-bio">{bio}</p> : null}
          {author.website ? (
            <p className="author-box-website">
              <a href={author.website} rel="me noopener noreferrer" target="_blank">
                {strings.visitWebsite}
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
