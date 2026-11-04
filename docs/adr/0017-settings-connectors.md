# ADR 0017 — Settings → Connectors (expanded scope)

- Status: accepted (owner scope decision, 2026-11-04)
- Completes the Settings menu started in ADR 0010

## Context

WordPress 7.1 adds Settings → Connectors: a screen where provider credentials
(OpenAI, Google, Anthropic, plus Akismet) are stored once and shared by
plugins. MERNPress had no Connectors entry. The build ships no AI feature and no
plugin runtime, so a connector screen must either store credentials honestly or
say the feature is unavailable.

## Decision

1. **Real credential storage.** Connectors store provider API keys in the
   `options` table (`connector_key_<provider>`, group `connectors`). Keys are
   encrypted with AES-256-GCM using a key derived (scrypt) from
   `AUTH_HASH_PEPPER`, so a database dump alone does not reveal them. The API
   never returns the key back — only a mask (`sk-…abcd`) and the connect time.
2. **The screen matches WordPress.** Settings submenu order is General,
   Connectors, Writing, Reading, Discussion, Media, Permalinks, Privacy. The
   page uses the WordPress layout: centered 630px column, "Connectors" title and
   description, a lavender AI banner with a primary action, provider rows with
   icon, name, description and a right-aligned action, and the footer note about
   additional connectors.
3. **Connection is per provider.** A row shows a password field and Connect when
   not configured, and "Connected · key sk-…abcd" with Disconnect when it is.
   Keys shorter than 8 characters are rejected; unknown providers 404.
4. **Honest about consumers.** The banner and Help state that no AI feature is
   bundled with this build, so stored keys are unused until one ships. The
   WordPress "Install the AI plugin" button is replaced by "Browse plugins",
   because MERNPress has no marketplace.
5. **Administrators only.** All connector routes require an authenticated
   administrator and the service requires `manage_options`, matching WordPress.

## Consequences

- No migration: credentials live in the existing `options` table.
- No bundled feature consumes the keys yet; the screen's copy says so instead of
  implying AI capabilities that do not exist.
- With this slice the Settings and Tools menus match WordPress except the two
  in-browser file editors (excluded as an RCE surface) and third-party
  importers/plugin marketplace entries already documented as unavailable.
