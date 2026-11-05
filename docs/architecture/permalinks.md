# Permalinks — developer guide

## Where the rules live

`packages/contracts/src/permalink.ts` is the single source of truth:

| Function | Purpose |
| --- | --- |
| `PERMALINK_PRESETS` | The five built-in presets and their patterns (Plain has `''`). |
| `validatePattern(value)` | Normalises and validates a custom structure. |
| `postPath(pattern, post)` | Canonical relative URL for a post. `post` needs `id`, `slug`, `publishedAt` (or `createdAt`) and `categorySlug` for `%category%`. |
| `matchPostPath(pattern, pathname)` | Captures `slug`/`id`/`category`/date tokens from a request path. |
| `termPath(taxonomy, slug, bases)` | `/categoryBase/slug` or `/tagBase/slug`. |
| `pagePath(slug)` | Pages always live at `/slug`. |
| `previewPostPath(pattern)` | Sample URL used by the settings screen. |

The module is isomorphic: no Node built-ins, React or database imports. It is
built to `dist` because the Next edge middleware cannot transpile workspace
TypeScript.

## Data flow

1. Settings → Permalinks stores `permalink_structure`, `permalink_pattern`,
   `category_base` and `tag_base` in the option store.
2. `GET /api/public/site` exposes `permalinkStructure`, `permalinkPattern`,
   `categoryBase` and `tagBase`.
3. Public post endpoints add `path` to the post and each term (see
   `presentPost` in `apps/api/src/routes/public-content.ts`).
4. The web app renders links, canonical tags, JSON-LD, sitemap, RSS and
   `llms.txt` from `post.path` / `term.path`. Never rebuild a URL by hand.
5. `apps/web/middleware.ts` resolves incoming pretty URLs:
   - `GET /api/public/resolve?path=…` (or `?p=…` for Plain, `?slug=…`) returns
     `{ slug, canonicalPath }` for published posts only.
   - a matching path is rewritten to `/posts/<slug>`;
   - if the resolver reports a different canonical path it is 301-redirected;
     a path that does not match the structure (e.g. a wrong date shape) is a 404.
6. Custom category/tag bases rewrite to `/category/<slug>` / `/tag/<slug>`.

## Adding a token

1. Add it to `PERMALINK_TOKENS`.
2. Handle it in `tokenValue` (generation) and `matchPostPath` (capture).
3. Decide the resolver validation in `ContentService.resolvePublicPath`.
4. Extend `packages/contracts/test/permalink.test.ts` and
   `apps/api/test/content/permalink-routing.test.ts`.

## Known limitations

- Numeric permalinks contain the UUIDv7 id (`/archives/<uuid>`), not a small
  integer, because MERNPress uses UUID primary keys.
- The internal `/posts/<slug>` route remains reachable and emits the correct
  canonical tag; it is not 301-redirected.
- Changing the structure does not create redirects for old URLs.
- Tokens must be whole path segments (`/blog/%postname%/` works;
  `/post-%postname%/` does not).
