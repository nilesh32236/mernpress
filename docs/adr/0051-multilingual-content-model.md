# ADR 0051 — Multilingual content model

- Status: accepted (owner scope decision, 2026-11-06)
- Implements the multilingual item from
  [wordpress-feature-gaps.md](../research/wordpress-feature-gaps.md) (smallest
  complete slice; WPML/Polylang-scale tooling is not claimed)

## Context

WordPress core has no multilingual content model. Sites install Polylang
(900,000+ active) or WPML, which usually add a separate translations table, a
language switcher and per-language URLs. MERNPress stores every document in one
`posts` table with unique `(type, slug)`; the public URL is derived centrally
from the permalink settings by `@mernpress/contracts`.

A translation is the same kind of document in another language, not a new
content type. Copying content into a separate table would duplicate revisions,
terms, comments, media relationships and the (already large) renderer/editor
contracts. A small, explicit model is enough for the first slice and keeps every
existing feature working.

## Decision

1. **Two columns, no new table.** `posts.language` (`varchar(10)`, default `en`)
   and `posts.translation_group` (`uuid`, DB default `gen_random_uuid()`).
   Existing rows keep `en` and each becomes its own group. A unique
   `(translation_group, language)` constraint guarantees one variant per
   language. Migration `add_post_languages` is additive.
2. **Language configuration is an option.** `site_languages` (group `general`)
   holds `{ default, enabled[] }`; the shared contract normalizes codes,
   always keeps the default enabled and drops invalid/duplicate entries.
   Settings → Languages edits it (predefined list plus custom codes such as
   `pt-br`). Changing the default re-prefixes the old default's posts; no
   content is rewritten.
3. **Default language is unprefixed.** Paths stay exactly as before
   (`/posts/hello`, `/about`). Other enabled languages use `/<language>/…`
   (`/hi/posts/hello`, `/hi/about`). `languagePath`/`stripLanguagePrefix`
   in `packages/contracts/src/languages.ts` are the single source of truth for
   the prefix rule.
4. **Translations are linked documents.** The editor's language select sets the
   variant; the Translations panel lists every sibling in the group and creates
   a draft in a chosen unused language. Creation copies the body, title, excerpt
   and format, but **not** SEO/OG/canonical overrides (those are
   language-specific and copying them would duplicate metadata). The new draft
   gets a `<source-slug>-<language>` slug and the creator as author. It never
   copies terms or comments.
5. **API.** `GET/PUT /api/admin/languages` (read for signed-in staff, write
   requires `manage_options`); `GET/POST /api/admin/posts/:id/translations`
   (create requires `content.create` and object-level edit rights on the
   source); `language` on post create/update (validated against the enabled
   list, `400 LANGUAGE_NOT_ENABLED`, duplicate variant `409
   TRANSLATION_EXISTS`); `?lang=` on the public slug and resolve routes.
6. **Public routing.** The edge middleware removes an enabled non-default
   first segment, resolves the inner path inside that language and rewrites to
   the internal renderer with `?lang=`. Unprefixed paths resolve in the default
   language. Language-prefixed single-segment paths are treated as translated
   pages. Canonical redirects keep the prefix.
7. **SEO.** Single post/page responses include published translations with
   their language paths; `generateMetadata` emits `alternates.languages` for
   every variant plus `x-default` (the default-language variant). The sitemap
   loops every enabled language, lists each variant at its own URL and groups
   them by `translationGroup` so every translated document also carries
   `xhtml:link` alternates (with `x-default`; the home page when the
   default-language variant is unpublished). The post page renders a language
   switcher (`LanguageLinks`).
8. **Archives stay default-language.** The home feed, category/tag/author
   archives, search and pagination read the default language only; a translated
   post is not duplicated into the default feed. A prefixed archive URL
   (`/hi/posts`, `/hi/search`, `/hi/category/...`) redirects 301 to the plain
   default-language URL instead of rendering default content in foreign chrome.
9. **One canonical URL per variant.** A public `?lang=<enabled non-default>` is
   a duplicate: the middleware redirects `/posts/<slug>?lang=hi` (and
   `/<page>?lang=hi`) to the language-prefixed canonical and drops `lang` from
   archive URLs. The internal rewrite hop carries an `x-mn-internal` marker;
   `x-mn-language` is trusted only on that hop and only for an enabled code.
   A disabled language never silently falls back to the default on detail or
   resolve requests (404).
10. **Index hygiene.** The sitemap excludes password-protected documents,
    non-empty canonical overrides and `noindex` robots values, pages through
    the public list instead of truncating at 100, and only emits alternates for
    groups with more than one published language. `x-default` points at the
    home page when the default-language variant is unpublished, matching the
    page head. JSON-LD uses the document language and the feed uses the default
    language; page slugs reserved by the router (`posts`, `author`, `category`,
    `tag`, `llms`) are rejected.
11. **Convergence.** Language settings are cached for ~10 s and resolutions for
    ~30 s; URL/canonical changes after disabling a language or changing the
    default appear within that window.

## Consequences

- No schema duplication: revisions, notes, comments, terms and media keep
  working per variant with no new join tables.
- Slug uniqueness is global per type, so translation slugs get a language
  suffix; two languages cannot share a slug even though their URLs differ.
- Changing the default language or disabling a language changes public URLs
  immediately (paths are computed); there are no redirects for removed
  languages.
- Plain permalinks (`?p=<id>`) carry no language context; translated variants
  are addressed through their language-prefixed page URL only when a structured
  permalink is configured.
- No automatic machine translation or language negotiation by
  `Accept-Language`/geo. Per-language menus/theme strings and sitemap
  `xhtml:link` alternates are implemented (ADR 0052 and the sitemap helper);
  the hreflang data is in both the page `<head>` and the sitemap. Plain
  permalinks still carry no language context (documented above).
