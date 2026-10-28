# Phase 5 manual acceptance — Gutenberg editor MVP

Status: awaiting owner manual acceptance. Automated evidence: 307
unit/integration tests and 19/19 Playwright tests on branch
`feat/gutenberg-editor` (not pushed, not deployed). Use a development database
and `pnpm dev`; do not point this at production.

Accounts: an administrator plus an editor. Optionally a contributor to check
the no-publish state (`pnpm dev:create-test-account --i-understand-dev-only
--role contributor`).

## 1. Editor canvas

- [ ] Posts → New post. Exactly one `New post` heading is present; the shell
      breadcrumb is not duplicated behind the editor header.
- [ ] Type a title in the large field; type a paragraph in the white canvas.
- [ ] Press Enter: a new paragraph block is created.
- [ ] Type `/` in an empty block: the block inserter opens with search.
- [ ] Insert Heading, List, Quote, Separator and Spacer. Confirm each renders
      with WordPress-like styling and a contextual block toolbar.
- [ ] Select text; bold/italic/link controls work; the link popover validates a
      URL.
- [ ] Select a block and open **Block settings**: the inspector shows the
      block's settings (not the "select a block" hint).
- [ ] Open **Document overview** (list view): the block tree appears and
      selecting an entry focuses the block.
- [ ] Undo/redo (toolbar or Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z) restores structural
      edits without discarding text typed before them.
- [ ] The toolbar's Add block button is keyboard reachable and labelled.

## 2. Save, reload, publish

- [ ] **Save draft** creates the post, navigates to `Edit post`, and shows
      `Content created.` The canvas still shows the content.
- [ ] Reload the page: title, paragraph, heading, list and all block settings
      persist. No content is lost.
- [ ] Ctrl/Cmd+S saves without opening the browser's "save page" dialog.
- [ ] **Publish** on a draft publishes and shows `Content published.`; the
      status badge becomes Published.
- [ ] Edit the published post: the primary action becomes **Update**; saving
      shows `Changes saved.`
- [ ] Unpublish, Trash (confirmation), Restore from the document sidebar work
      and update the status badge.
- [ ] Open the same post in a second tab, save there, then save the first tab:
      the 409 conflict panel appears and **Reload latest version** loads the
      newer content.
- [ ] The image block shows **Insert from URL**. Upload is intentionally
      disabled with a Phase 6 message.

## 3. Document sidebar

- [ ] Slug and Excerpt edit and persist.
- [ ] Categories and tags can be checked/unchecked; saving assigns them;
      reopening shows the selection.
- [ ] The publishing panel shows status, author, published/updated timestamps
      and version.
- [ ] Settings toggles the sidebar; the `×` closes it; focus returns sensibly.
- [ ] A contributor sees only **Save draft** (no Publish) and can edit only
      their own draft.

## 4. Responsive and accessibility

- [ ] 375×812: hamburger opens the navigation drawer; the editor has no
      horizontal scroll; the document sidebar is off-canvas and opens via
      **Settings**; the canvas is usable and the title wraps/scales.
- [ ] Keyboard-only: skip link focuses main content; tab reaches the title,
      canvas, toolbar, inserter and Save/Publish; focus is visible.
- [ ] Screen reader: one h1; the canvas has an accessible name; buttons have
      unique names (no duplicate Publish/Settings/close labels).
- [ ] Browser console has no unexpected errors after editing, saving and
      reloading (a pre-auth 401 on session probe is expected).
- [ ] `localStorage`/`sessionStorage` remain empty after using the editor
      (auth or preference state must not be persisted there).

## 5. Regression boundaries

- [ ] Dashboard counts, Posts/Pages lists, status tabs, search, pagination and
      URL Back/Forward still work.
- [ ] Terms page create/rename/delete and no-access state still work.
- [ ] Subscriber sees no content navigation and no counts.
- [ ] Sign out still works; the API is authoritative for every write.

## 6. Known limitations (not defects for this slice)

- No preview action; the public renderer is Phase 7.
- No media upload/library; image block supports URL only.
- Undo is burst-level snapshot history, not per-keystroke parity.
- WordPress CSS is global (no iframe isolation); popovers portal to `body`.
- The editor chunk is ~5.98 MB (1.34 MB gzip) and lazy-loaded; the dashboard and
  lists do not load it.
