# Plugin runtime — developer guide

Plugins are trusted local packages in the writable plugin store
(`PLUGIN_STORAGE_DIR`, production `/opt/mernpress/plugins`). A package is a
directory named after its id:

```
plugins/my-plugin/
  plugin.json     # manifest (required)
  plugin.mjs      # optional runtime module
  ...assets
```

## Manifest

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "Your name",
  "description": "What it does, shown in the plugin list.",
  "details": "One short line shown under the name.",
  "toolbarLyrics": ["optional", "admin toolbar lines"]
}
```

`id` must match `^[a-z0-9][a-z0-9-]{0,63}$`. Invalid manifests are skipped and
logged; they never break the Plugins screen.

## Module contract

```js
export function activate(api) {
  api.hooks.addFilter('content.post.create', (draft) => {
    return draft;
  });
  api.hooks.addAction('content.post.published', async (payload) => {
    await api.options.set('publishedCount', 1);
  });
}

export function deactivate(api) {
  // Optional. Hooks are disposed automatically.
}
```

`api` contains:

| Member | Purpose |
| --- | --- |
| `plugin` | `{ id, name, version, dir }` |
| `hooks.addAction(name, handler, priority?)` | Register a lifecycle action |
| `hooks.addFilter(name, handler, priority?)` | Register a typed filter |
| `options.get(key, fallback)` / `options.set(key, value)` | Plugin-scoped storage (`plugin:<id>:<key>`) |
| `log(message, meta?)` | API log with the plugin prefix |

Available hook names are the typed maps in
`packages/cms-core/src/hooks/types.ts`. Filters must return the draft; throwing
`HookRejectedError` vetoes the write. Actions run after commit and cannot change
the result.

## Lifecycle

1. Operator copies the package into the store.
2. Activate in Appearance → Plugins (or `POST /api/admin/plugins/:id/activate`).
   The module loads before the plugin is marked active; failures return 422.
3. On API startup, active modules are loaded (`startActive`).
4. Deactivate disposes every registered hook; delete requires deactivation and
   removes the package directory.

## Trust and security

Plugin code runs in the API process with server privileges and is **not
sandboxed**. It can import Node built-ins even though the API object exposes
none. Only reviewed packages may be installed; there is no upload, marketplace
or remote download. A plugin bug can slow or crash the API — this is why the
`details` and store are operator-controlled.
