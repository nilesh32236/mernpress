# ADR 0052 — Per-language menus and theme strings

- Status: accepted (owner scope decision, 2026-11-06)
- Extends [ADR 0051](0051-multilingual-content-model.md) (multilingual content)

## Context

ADR 0051 gave every document a language and language-prefixed public URLs. The
site chrome stayed language-blind: the header menu came from one
`customizer_menu` option, the footer labels were hardcoded English, and
`<html lang>` was fixed to `en`. A translated page therefore rendered Hindi
content inside an English shell.

WordPress solves this with per-language menus and translated theme strings
(Polylang/WPML language switchers and `.mo` files). Those are large systems. A
small, explicit model covers the visible chrome without touching the renderer
or adding a translation-file pipeline.

## Decision

1. **Per-language menu overrides are an option.**
   `customizer_menus` (group `appearance`) stores
   `Record<language, CustomMenuItem[]>` for non-default languages. The default
   language keeps using `customizer_menu` and Appearance → Customize → Menus,
   so the existing editor is unchanged. Each entry is validated by the same
   `validateMenu` (label 1–80, site path or http(s) URL, max 20 items); an empty
   list removes the override.
2. **Chrome strings are an option.**
   `theme_strings` (group `appearance`) stores
   `Record<language, Partial<ThemeStrings>>` over `skipToContent`, `search`,
   `blog`, `home`, `feed`, `primaryNav` and `footerNav`. Values are trimmed,
   limited to 40/60/80 characters and unknown keys are rejected. The built-in
   English defaults live in `packages/contracts/src/theme-strings.ts`, shared by
   the API, admin and web app.
3. **Effective strings.** `themeStringsFor(map, language, defaultLanguage)`
   merges built-ins → default-language overrides → request-language overrides.
   A language can therefore translate only the labels it cares about.
4. **Request language travels in a header.** The edge middleware resolves the
   language once (from the URL prefix), sets `x-mn-language` on the forwarded
   request and preserves it on the internal second hop (the rewritten
   `/posts/<slug>` request passes through the middleware again). The root layout
   reads the header and sets `<html lang>`, the skip link, footer labels and the
   navigation aria labels. A direct render outside a request (unit tests) falls
   back to the default language.
5. **Menu selection.** The layout uses `languageMenus[language]` when present.
   For the default language it falls back to `customizer_menu`, then to the
   published-pages list. Non-default languages do **not** fall back to the
   default menu or English page titles: a language either has its own menu or no
   header navigation, which prevents a Hindi page linking to English labels.
6. **Admin surface.** Settings → Languages gains two editors after the language
   list: **Theme strings** (language select, a find box, and the 61 strings
   grouped by where they appear — header/navigation, posts/author, comments,
   archives/search/pagination, not found) and **Language menu** (non-default
   languages; Navigation label/URL rows, add, remove, Move up/Move down, save).
   Endpoints: `GET/PUT /api/admin/theme-strings` and
   `GET/PUT /api/admin/language-menus`, administrator-only writes through the
   option service. Menu and string errors render inside their own panel rather
   than only in the other form. The grouping constant lives in
   `@mernpress/contracts` next to the keys, so the admin and any future editor
   share one source.
7. **Public payload.** `GET /api/public/site` includes `themeStrings` and
   `languageMenus`. They contain no secrets and are safe to expose.
8. **Public error localization.** Comment rejections carry a stable
   `details.reason` (`comments_closed`, `login_required`, `name_required`,
   `email_invalid`, `content_required`, `content_too_long`, `url_invalid`,
   `reply_missing`, `too_fast`). The public site maps it to per-language theme
   strings and never displays the API's English message; unknown/older reasons
   fall back to the localized generic failure.
9. **Component strings.** The same contract carries the visible strings for
   post meta (written by / min read / category connector / uncategorized / post
   navigation), the author box, related/more-posts headings, comments (headings,
   reply, form labels, submit and notices), pagination aria labels, the search
   form and archive/search empty states. `requestThemeStrings()` resolves the
   request language and settings once per page; pages pass the map to
   `PostView`, `PostList`, `Pagination`, `SearchForm`, `MorePosts` and
   `LanguageLinks`. Components default to `DEFAULT_THEME_STRINGS` so they remain
   usable in isolation and their unit tests do not need a request context.
   The 404 page copy (`notFoundTitle`, `notFoundText`,
   `notFoundImageAlt`) is part of the same contract and is rendered by
   `app/not-found.tsx`, so a missing translated URL stays in its language.
   The `dateLocale` key (default `en-US`, BCP 47 shape) drives
   `formatPublicDate()` in `apps/web/lib/date.ts`, used by post lists, related/
   more posts and comments; malformed locales fall back to `en-US`.

## Consequences

- One source of truth for both admin editors and the public layout; no
  translation files, no build step, no server restart.
- Menu URLs are literal: a Hindi menu must use `/hi/...` paths. Automatic
  prefixing would break external links and the default language menu.
- Layout chrome, post meta, author box, related/more-posts headings, comments,
  pagination aria labels, the search form, date formatting and the 404 page
  copy are translated. Remaining English: API error messages (server-provided,
  not theme strings).
- No per-language widgets, sidebars or theme template overrides.
- Changing the enabled languages leaves orphaned `theme_strings`/menu entries
  in the option; they are ignored while the language is disabled and become
  active again if it is re-enabled.
