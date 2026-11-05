# ADR 0037 — Author box and local initials avatars

- Status: accepted (owner scope decision, 2026-11-05)
- Completes the author-box item from the plugin/theme roadmap

## Context

Theme-market research lists an author box among the most requested blog-theme
features. WordPress core has no author box; themes or plugins add it, and
avatars normally come from Gravatar, which discloses every visitor's IP (and a
hash of their email, if logged in) to a third party.

MERNPress already stores the profile fields an author box needs: display name,
bio and website.

## Decision

1. **Author box on single posts only.** Posts render an "About the author"
   section between the article and the previous/next navigation. Pages do not.
2. **It uses existing profile fields.** Display name falls back to the username;
   bio and website render only when set. No new database column or endpoint.
3. **Local initials avatar.** The avatar is a CSS circle with one or two
   initials derived from the display name (falling back to the username's first
   letter). No Gravatar, no remote image, no third-party request — reading a
   post does not disclose the visitor to another service. Comment avatars
   already use the same approach.
4. **Public author summary.** `PublicPost.author` gains `displayName`, `bio` and
   `website`. Email, role, status and every other account field are never
   exported; a regression test asserts the serialized public payload contains
   neither the email nor `passwordHash`.
5. **Safe links.** The archive link uses `rel="author"`. The author's website is
   validated as http(s) when saved and rendered with
   `target="_blank" rel="me noopener noreferrer"`.
6. **Theme-aware.** The box uses theme tokens (surface, border, muted, radius
   where applicable) and collapses to a smaller avatar on narrow screens, so
   both MERNPress and Journal render it correctly.

## Consequences

- No migration and no schema change; the Prisma select is wider by three
  nullable columns.
- The author box adds no client JavaScript and no image request.
- A future slice could add an uploaded avatar behind the same component; the
  local initials remain the fallback.
