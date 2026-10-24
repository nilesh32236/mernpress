# WordPress 7.1.3 core audit

Date: 2026-10-24. Source: `../wordpress` (read-only). Version verified in
`wp-includes/version.php`: `$wp_version = '7.1.3'`, `$wp_db_version = 61833`.
The official WordPress release API reported 7.1.3 as current on the audit date.
License: GPLv2 or later (`license.txt`). This audit is for design study; no
WordPress code is copied into MERNPress.

The purpose is not to reproduce WordPress. It is to identify contracts that are
worth **emulating**, ideas to **adapt** to Node/React, and implementation choices
to **avoid**.

## 1. Philosophy and what it implies

The official [WordPress philosophy](https://wordpress.org/about/philosophy/)
(accessed 2026-10-24) states:

- **Out of the box:** working software with little configuration.
- **Design for the majority:** non-technical editors are the primary users.
- **Decisions, not options:** every option transfers a decision to the user;
  good defaults are a feature.
- **Clean, lean, and mean:** core serves the needs of the majority; the rest is
  plugins/themes.
- **Striving for simplicity:** every release should be easier to use.
- **Deadlines are not arbitrary:** ship regular, smaller releases.
- **The vocal minority:** feedback is important but not representative.
- **GPL freedoms:** the licence is part of the product philosophy.

Implications for MERNPress:

1. First run must be short and boring: install, configure database, create admin,
   write a page.
2. The editor UI is for writers, not Node developers. Do not expose bundler,
   database or deployment details in the content workflow.
3. Prefer one good default over three configuration knobs. Settings pages are
   for real needs, not implementation preferences.
4. Keep core small. Site-specific content types and marketing blocks belong to
   plugins/themes.
5. Accessibility and clear feedback are part of "works out of the box", not a
   later polish phase.
6. Compatibility and predictable extension contracts matter more than clever
   abstractions.

## 2. Content lifecycle

Files: `wp-includes/post.php`, `wp-admin/includes/post.php`,
`wp-includes/revision.php`, `wp-includes/cron.php`.

### 2.1 One write path

- `wp_insert_post()` and `wp_update_post()` are the single create/update entry
  points. They accept an associative array, fill defaults, sanitize for the DB,
  generate a unique slug, fire `wp_insert_post`/`wp_update_post`/`save_post`, and
  transition status through `wp_transition_post_status()`.
- The contract returns an integer ID or `WP_Error`.

**Adapt:** one content service with explicit create/update methods, a transaction,
status-transition hooks and typed errors. **Avoid:** implicit global current user,
global post object and side effects hidden in the write path.

### 2.2 Statuses and transitions

- Statuses are registered with `register_post_status()`. Core includes
  `publish`, `draft`, `pending`, `private`, `trash`, `auto-draft`, `inherit`,
  `future`.
- `wp_publish_post()` handles publishing; scheduled posts use the `future`
  status and a cron event.

**Adapt:** a finite, explicit status enum with an allowed-transition table. For
MERNPress MVP: `DRAFT`, `PUBLISHED`, `TRASH`; add `SCHEDULED`, `PRIVATE` and
`PENDING` only with a concrete need. Do not let arbitrary strings become statuses.

### 2.3 Trash and restore

- `wp_trash_post()` stores the previous status in `_wp_trash_meta_status` and the
  trash time in `_wp_trash_meta_time`. `wp_untrash_post()` restores it.
- `EMPTY_TRASH_DAYS` controls automatic permanent deletion (default 30).

**Emulate:** soft delete with a recoverable previous status and an explicit
"empty trash" operation. MERNPress stores `previous_status` and `trashed_at` on
the content row (or a dedicated trash table if the model grows).

### 2.4 Revisions and autosave

- `wp_save_post_revision()` creates a revision post (`revision` post type) with
  `post_parent` pointing at the original.
- `_wp_put_post_revision()` writes it; `wp_restore_post_revision()` copies fields
  back; `wp_delete_post_revision()` removes one.
- Autosave is stored as a special revision and triggered by the editor/heartbeat.

**Adapt:** immutable revision rows linked to the content item, with a diff and
restore operation. Autosave is a separate, replaceable snapshot per user/content,
not a published revision. MERNPress will use a base version/`updated_at` conflict
check rather than WordPress's global autosave behavior.

### 2.5 Slugs and permalinks

- `wp_unique_post_slug()` appends `-2`, `-3`, etc.; hierarchical post types use
  parent paths. It is filterable.
- `WP_Rewrite` builds regex rules from permalink structure tags; `redirect_canonical()`
  guesses and redirects.

**Emulate:** deterministic unique-slug algorithm with a documented normalization
and reserved-word list. When a slug changes, create a redirect from the old path.
**Adapt:** an explicit router and path table; do **not** reproduce WordPress's
rewrite-rule regeneration or canonical guessing. A miss is a 404 plus a logged
path, not a guess.

### 2.6 Post meta

- `add_post_meta`/`update_post_meta`/`get_post_meta`/`delete_post_meta` implement
  an EAV table; keys beginning with `_` are hidden from the UI.

**Adapt:** typed columns for core fields; a namespaced JSONB metadata table for
plugin/theme data. **Avoid:** EAV for title, slug, status, SEO and other fields
that are queried and validated constantly.

## 3. Roles and capabilities

Files: `wp-includes/capabilities.php`, `class-wp-roles.php`, `class-wp-user.php`.

- `WP_Roles` maps role names to capability lists. Roles are not hard-coded; plugins
  can add/remove roles and caps.
- `WP_User::has_cap()` evaluates capabilities and applies the `user_has_cap` filter.
- `map_meta_cap()` is the important part: it maps an object-level meta capability
  such as `edit_post` to primitive capabilities based on the post's author,
  status and the user's role. `current_user_can( 'edit_post', $id )` is the
  public contract.
- Admin menus are registered with a capability and checked before rendering
  (`add_menu_page( ..., $capability, ... )`, `user_can_access_admin_page()`).

**Emulate:** a capability table and object-level checks. Every mutation calls a
domain authorization function, not just a route guard. The admin UI hides what
the user cannot do, but the server is the authority.

**Adapt:** MERNPress roles are rows, not a TypeScript enum. Seed
`administrator`, `editor`, `author` with capability sets; plugins can register
capabilities. MVP can restrict users to one role; the schema can allow more later.

## 4. Hooks and plugin lifecycle

File: `wp-includes/plugin.php`; plugin lifecycle in
`wp-admin/includes/plugin.php`.

- `add_action()` / `add_filter()` register callbacks with a priority (default 10)
  and accepted argument count. Callbacks are stored in the global `$wp_filter`.
- `do_action()` / `apply_filters()` execute them; `remove_action`/`remove_filter`
  remove them by callback identity.
- `register_activation_hook`, `register_deactivation_hook` and
  `register_uninstall_hook` key lifecycle behavior to the plugin basename.
- Plugins are discovered as PHP files in `wp-content/plugins`, activated in the
  database, and run in the same process with full privileges.

**Adapt:** a typed action/filter bus with priority, async support, error isolation
and deterministic ordering. Lifecycle hooks are explicit manifest operations.
**Avoid:** a mutable global registry, implicit load order, and any claim that
same-process plugin code is sandboxed. In Node, a plugin can read files, open
sockets and access the database with the server's privileges.

**Security rule for MERNPress:** only trusted local/reviewed plugins. No automatic
download or execution of remote plugins. Plugin migrations are reviewed. The
plugin API is a compatibility contract, not a security boundary.

## 5. Blocks and Gutenberg

Files: `wp-includes/blocks.php`, `wp-includes/block-editor.php`,
`wp-includes/class-wp-block-parser.php`, `class-wp-block.php`,
`class-wp-block-type.php`, `wp-includes/block-patterns.php`,
`wp-includes/block-template.php`.

### 5.1 Storage format

WordPress stores block content in `post_content` as HTML with block comments:

```html
<!-- wp:paragraph {"align":"center"} -->
<p class="has-text-align-center">Hello</p>
<!-- /wp:paragraph -->
```

- `parse_blocks()` returns a tree of `{ blockName, attrs, innerBlocks, innerHTML,
  innerContent }`.
- `serialize_block()` is the inverse; `render_block()` renders one block;
  `do_blocks()` renders content.
- Attributes are JSON in the comment. Invalid JSON or unknown blocks must not
  crash the parser; they degrade to freeform HTML.
- `block.json` metadata (`register_block_type_from_metadata`) declares name,
  attributes, supports, styles, scripts, render callback and API version.
- Dynamic blocks have a server render callback and usually save no markup.
- Patterns are registered block markup strings; synced patterns are stored as
  `wp_block` posts. Block bindings (6.7+) bind attributes to external sources.

**MERNPress decision:** adopt the WordPress-compatible serialized format as the
canonical content format for MVP. It is the interoperability contract with the
official editor and preserves unknown blocks. This is a deliberate exception to
the general "avoid comment-delimited formats" advice: the format is fragile in
general, but it is **the** Gutenberg contract. Mitigate with:

- a versioned `content_format` and `content_version`;
- a hardened parser with round-trip and malformed-input tests;
- a derived AST/render cache, never the source of truth;
- explicit unknown-block preservation;
- golden fixtures generated from WordPress and from the editor.

A future move to a structured JSON store would be a separate ADR with a migration
path. Do not invent a proprietary format in MVP.

### 5.2 Block supports and attributes

- `WP_Block_Type` holds name, category, icon, keywords, attributes schema,
  supports, styles, editor/frontend script handles and render callback.
- `block_has_support()` and `serialize_block_attributes()` handle supports and
  attribute serialization.
- Core supports include color, typography, spacing, border, layout, align,
  anchor, className, customClassName, html, inserter, multiple, reusable and lock.

**Adapt:** a `BlockDefinition` contract with a JSON-schema/Zod attribute schema,
defaults, supports, editor component, save function and server render function.
Implement a subset of supports in MVP (align, className, spacing, color where the
block uses it). Do not promise full `theme.json` parity.

### 5.3 Serialization pitfalls

WordPress omits an attribute from the serialized comment when its value equals the
schema default. The reference CMS discovered this the hard way: default copy
disappeared from the database. The solution was to remove `default` from the
editor schema and materialize defaults on mount/render.

**MERNPress rule:** if a value must survive a round trip, either (a) do not put a
`default` in the editor attribute schema, or (b) always materialize and serialize
it explicitly. Test this with the real `@wordpress/blocks` serializer in the admin
and with the server parser. Do not duplicate defaults in two places.

## 6. REST API

Files: `wp-includes/rest-api.php`, `class-wp-rest-server.php`,
`endpoints/class-wp-rest-controller.php`.

- `register_rest_route( $namespace, $route, $args )` declares methods, callback,
  `permission_callback` and argument schema.
- `WP_REST_Server::dispatch()` matches the route, validates/sanitizes arguments,
  calls the permission callback, then the handler.
- `WP_REST_Controller` provides a consistent CRUD base: `get_items`, `get_item`,
  `create_item`, `update_item`, `delete_item`, `get_item_schema`,
  `get_collection_params`, `prepare_item_for_response`.
- Cookie authentication uses a nonce (`X-WP-Nonce`); application passwords and
  plugin-provided OAuth also exist.

**Emulate:** a controller/service boundary with a per-route authorization check
and a shared error envelope. **Adapt:** use opaque sessions for the admin and
bearer tokens for future machine clients; do not copy WordPress cookie/nonce
semantics. Keep request validation at the boundary (Zod) and domain invariants in
services.

## 7. Themes and templates

Files: `wp-includes/template-loader.php`, `template.php`,
`general-template.php`, `class-wp-theme-json.php`.

- The template hierarchy maps the request to candidate template files, then
  `locate_template()` searches the child theme, then the parent theme. Examples:
  `single-{post_type}-{slug}.php` → `single-{post_type}.php` → `single.php` →
  `singular.php` → `index.php`.
- `get_template_part( $slug, $name )` loads reusable parts.
- `theme.json` defines settings/styles; `WP_Theme_JSON` merges core < theme < user
  origins and emits CSS custom properties (`--wp--preset--color--*`,
  `--wp--style--*`).
- Content is in the database; presentation is in the theme. Template files are PHP
  includes with access to globals.

**Adapt:** a template/fallback chain as data, not PHP file magic. MERNPress themes
are trusted React/Next packages with a manifest mapping template names to
components. Template parts are components. Design tokens are CSS variables
generated from a theme settings file. **Avoid:** PHP-style implicit globals,
arbitrary code in templates and a full visual theme editor in MVP.

## 8. Media

Files: `wp-admin/includes/file.php`, `wp-includes/media.php`.

- `wp_handle_upload()` validates upload errors, size and MIME, moves the file and
  returns a URL/file path.
- `wp_check_filetype_and_ext()` checks the extension and the real MIME type
  (finfo), not just the browser-provided type.
- `wp_generate_attachment_metadata()` creates sub-sizes; metadata is stored in
  `_wp_attachment_metadata`.
- Attachments are posts of type `attachment`; image sizes are registered with
  `add_image_size()`.

**Adapt:** a storage abstraction, server-side MIME sniffing, size limits, image
re-encoding and derivative metadata. **Avoid:** conflating media with content
rows, serving user-controlled executable files, and trusting the client MIME type.

**MERNPress MVP:** images only (JPEG/PNG/WebP/AVIF), max size, magic-byte check,
sharp re-encode, thumbnails, alt/caption. No SVG. No video/audio until a later
decision.

## 9. Options, menus, taxonomies and comments

- **Options:** `get_option`/`update_option`/`add_option`/`delete_option` with an
  autoload flag. Values can be PHP-serialized; that is a security and portability
  liability. MERNPress stores JSONB and validates known option keys.
- **Menus:** a `nav_menu` taxonomy plus `nav_menu_item` posts rendered by a
  Walker. MERNPress can model menus as an ordered tree later; MVP uses theme
  configuration for header/footer links.
- **Taxonomies:** `register_taxonomy()` with hierarchical/flat behavior, term
  meta and unique term slugs. MERNPress uses one `terms` table with a taxonomy
  discriminator and a `post_terms` join.
- **Comments:** statuses (`hold`, `approve`, `spam`, `trash`), threading via
  `comment_parent`, moderation. This is a later generic feature; anti-spam and
  moderation are substantial.

## 10. Security model

- **Nonces:** `wp_create_nonce()` / `wp_verify_nonce()` are time-limited,
  user/action-scoped CSRF tokens. They are not authentication.
- **Escaping:** `esc_html`, `esc_attr`, `esc_url`, `esc_js`; `wp_kses` /
  `wp_kses_post` allowlist HTML.
- **SQL:** `$wpdb->prepare()` with placeholders; `esc_sql()` alone is not enough.
- **Capabilities:** every mutating action and admin page checks a capability.
- **Uploads:** extension + real MIME + size checks; unique filenames.
- **Passwords:** `wp_hash_password()` (phpass/bcrypt lineage); application
  passwords for API clients.

**Emulate:** defense-in-depth, allowlist sanitization, parameterized queries,
capability checks on every mutation, CSRF tokens for cookie-authenticated
state-changing requests, and upload validation.

**Do not claim:** that using Fastify/Prisma makes MERNPress secure. The threat
model must be maintained and tested.

## 11. What not to copy

| WordPress behavior | Why not | MERNPress alternative |
| --- | --- | --- |
| Bootstrap whole core + plugins per request | Node long-lived process; global state | Composition root + request context |
| Global `$wpdb`, `$wp_query`, `$post` | Hidden coupling, hard tests | Explicit dependencies/services |
| Frontend-triggered pseudo-cron | Unreliable, traffic-dependent | Worker/sweeper with a real schedule |
| PHP object serialization in options/meta | Deserialization risk, opaque data | JSONB + schema validation |
| EAV meta as the primary content model | Query complexity, weak typing | Typed columns + namespaced JSONB |
| PHP template includes with implicit globals | Unsafe, hard to type | React components + manifest |
| Same-process plugins described as sandboxed | False security boundary | Trusted local plugins; explicit warning |
| Comment-delimited block markup as a general format | Fragile outside Gutenberg | Adopt it **only** as the Gutenberg interoperability contract, with tests/versioning |
| Regex rewrite-rule regeneration | Complexity and surprising redirects | Explicit router + redirect table |
| Multisite table switching in core | Not MVP; large surface | Out of scope |
| Full WordPress parity | Endless scope | Documented subset and differences |

## 12. Emulate / adapt / avoid summary

| Mechanism | Verdict | MERNPress action |
| --- | --- | --- |
| Unified content write path + transition hooks | Emulate | `contentService.create/update/transition` with typed events |
| Trash with previous status | Emulate | `previous_status` + `trashed_at` + restore |
| `map_meta_cap` object-level checks | Emulate | Capability service + meta-cap mapping |
| Capability-gated admin menus | Adapt | Route guards + server checks; UI hides unauthorized actions |
| Actions/filters with priority | Adapt | Typed hook bus, async, error isolation |
| Lifecycle hooks | Adapt | Plugin manifest activate/deactivate/uninstall |
| `block.json` metadata | Adapt | `BlockDefinition` contract (TS/JSON schema), not PHP |
| WordPress block markup | Adopt as canonical | Versioned content format + parser + golden tests |
| Dynamic block render callback | Adapt | Server renderer owns output; editor save null |
| REST controller + permission callback | Emulate | Route schema + service + authorization |
| Template hierarchy | Adapt | Data-driven fallback chain in theme SDK |
| `theme.json` tokens | Adapt | CSS variables + theme settings |
| Media MIME/derivative pipeline | Adapt | Storage abstraction + sharp + metadata |
| Nonces, kses, prepared statements | Emulate | CSRF tokens, allowlist sanitizer, Prisma parameterization |
| Pseudo-cron | Avoid | Worker/sweeper |
| Global state | Avoid | Request context/DI |
| Same-process plugin sandbox claim | Avoid | Trusted local plugins only |
| Full parity | Avoid | Scoped MVP + documented differences |

## 13. Open questions for MERNPress

1. Which WordPress block supports are required by the initial block set, and which
   can be ignored without breaking the editor UX?
2. Does the official `@wordpress/block-serialization-default-parser` 6.0.0 handle
   the reference corpus (nested groups/columns, malformed attributes, unknown
   blocks)? A first synthetic test passed; the real corpus test is a Phase 5 gate.
3. How should block deprecations be represented so old content still loads after
   a block schema change?
4. Which theme.json-like settings are actually needed by the starter theme, versus
   nice-to-have global styles?
5. How much of the WordPress admin shell should be imitated before it becomes a
   maintenance burden? The target is familiarity, not pixel parity.

## 14. Sources

- Local source: `../wordpress` (WordPress 7.1.3), verified in
  `wp-includes/version.php`.
- [WordPress philosophy](https://wordpress.org/about/philosophy/), accessed
  2026-10-24.
- [Block Editor Handbook](https://developer.wordpress.org/block-editor/),
  accessed 2026-10-24.
- [Plugin Handbook — hooks](https://developer.wordpress.org/plugins/hooks/),
  accessed 2026-10-24.
- [Theme Handbook — template hierarchy](https://developer.wordpress.org/themes/basics/template-hierarchy/),
  accessed 2026-10-24.
- [REST API Handbook](https://developer.wordpress.org/rest-api/), accessed
  2026-10-24.
- [Security](https://developer.wordpress.org/advanced-administration/security/),
  accessed 2026-10-24.

Line numbers are deliberately avoided where they drift between minor releases;
the cited files and symbols are the stable references.
