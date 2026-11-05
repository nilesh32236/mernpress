# ADR 0027 — Trusted local plugin runtime

- Status: accepted (owner scope decision, 2026-11-05)
- Extends: ADR 0012 (plugins), ADR 0025 (package store)

## Context

Plugin packages were manifests only: they could contribute metadata and toolbar
lyrics but no behaviour. The owner asked for real plugins that serve a specific
use case, not placeholders. The repository policy already says plugin code runs
in the server process with server privileges and is not sandboxed.

## Decision

1. **A package may ship `plugin.mjs`.** It exports `activate(api)` and optional
   `deactivate(api)`. Packages with no module (like Hello MERNPress) remain
   valid; they contribute manifest-defined behaviour only.
2. **The API is narrow and typed.** `PluginRuntimeApi` exposes:
   - `hooks.addAction` / `addFilter` from the internal typed registry
     (`content.post.*`, `content.post.scheduled`, taxonomy events),
   - plugin-scoped options (`plugin:<id>:<key>` in the `options` table),
   - the plugin id/name/version/directory,
   - a logger prefixed with the plugin id.
   There is no filesystem, network, HTTP or Prisma handle on the API. A plugin
   can still `import('node:fs')` because it is trusted code; that is documented,
   not prevented.
3. **Activation is transactional in practice.** The module is loaded and
   `activate()` is awaited **before** the plugin is recorded active. A throwing
   module is unsubscribed, logged and returned as
   `422 PLUGIN_ACTIVATION_FAILED`; it never becomes active.
4. **Deactivation disposes everything.** Every hook registered through the
   wrapped registry is recorded, so deactivation and deletion unsubscribe even
   if the plugin forgot to. `deactivate()` runs first, then the hooks are
   disposed, then the active list is updated.
5. **Startup restores active modules.** `plugins.startActive()` runs before the
   API serves routes; a module that fails is dropped from the active list and
   logged so one bad package cannot take the API down. A database outage during
   boot is logged and skipped (health/readiness still start).
6. **Shutdown and delete are safe.** API `onClose` calls `stopAll()`; deleting an
   inactive plugin also unloads any stale module before removing the directory.
7. **Only trusted packages.** There is no marketplace, download or upload. The
   store is operator-managed (ADR 0025) and the package directory must be
   reviewed before it is copied in.

## Consequences

- The first real plugin, **Auto Excerpt**, fills an empty excerpt from the post
  body on create/update and never overwrites an author-written one.
- Hooks run in the API process, so a plugin bug can affect API latency or crash
  the process. This is the documented residual risk of trusted local plugins.
- A future Phase 9 public plugin SDK can formalise versioning and capabilities;
  this runtime is the minimal contract that makes plugins real now.
