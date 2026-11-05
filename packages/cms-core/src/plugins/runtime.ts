import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DatabaseClient } from '@mernpress/database';
import type { HookRegistry } from '../hooks/types.js';
import type { PluginManifest } from './registry.js';

/**
 * Trusted local plugin runtime.
 *
 * A plugin package may ship a `plugin.mjs` module that exports
 * `activate(api)` / `deactivate(api)`. The API is deliberately narrow:
 * lifecycle hooks, plugin-scoped options and a logger. Plugins are NOT
 * sandboxed (documented in ADR 0027): only reviewed, locally installed packages
 * may run, and nothing is downloaded at runtime.
 *
 * Every hook registration made through `api.hooks` is recorded so deactivation
 * (or deletion) unsubscribes it, even if the plugin forgot to return disposers.
 */
export interface PluginRuntimeApi {
  plugin: { id: string; name: string; version: string; dir: string };
  hooks: HookRegistry;
  options: {
    get<T>(key: string, fallback: T): Promise<T>;
    set(key: string, value: unknown): Promise<void>;
  };
  log(message: string, meta?: Record<string, unknown>): void;
}

export interface PluginModule {
  activate?: (api: PluginRuntimeApi) => void | Promise<void>;
  deactivate?: (api: PluginRuntimeApi) => void | Promise<void>;
}

export interface LoadedPlugin {
  id: string;
  dispose(): Promise<void>;
}

const MODULE_FILE = 'plugin.mjs';
const OPTION_PREFIX = 'plugin:';

export interface PluginRuntimeOptions {
  prisma: DatabaseClient;
  hooks: HookRegistry;
  logger?: (message: string, meta?: Record<string, unknown>) => void;
}

function scopedOptions(prisma: DatabaseClient, pluginId: string) {
  const prefix = `${OPTION_PREFIX}${pluginId}:`;
  return {
    async get<T>(key: string, fallback: T): Promise<T> {
      const row = await prisma.option.findUnique({ where: { key: `${prefix}${key}` } });
      if (!row) return fallback;
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return fallback;
      }
    },
    async set(key: string, value: unknown): Promise<void> {
      const fullKey = `${prefix}${key}`;
      await prisma.option.upsert({
        where: { key: fullKey },
        create: { key: fullKey, value: JSON.stringify(value), group: 'plugins' },
        update: { value: JSON.stringify(value), group: 'plugins' },
      });
    },
  };
}

/** Load and activate one package module. Returns a disposer for deactivation. */
export async function activatePluginModule(
  options: PluginRuntimeOptions,
  manifest: PluginManifest,
  pluginDir: string,
): Promise<LoadedPlugin> {
  const dir = path.resolve(pluginDir);
  const modulePath = path.resolve(dir, MODULE_FILE);
  // The module must live inside the package directory; traversal via the
  // manifest id is already rejected by the manifest validator.
  if (!modulePath.startsWith(`${dir}${path.sep}`)) {
    throw new Error(`Invalid plugin module path for ${manifest.id}`);
  }

  const disposers: Array<() => void> = [];
  const hooks: HookRegistry = {
    addAction: (name, handler, priority) => {
      const off = options.hooks.addAction(name, handler, priority);
      disposers.push(off);
      return off;
    },
    addFilter: (name, handler, priority) => {
      const off = options.hooks.addFilter(name, handler, priority);
      disposers.push(off);
      return off;
    },
    doAction: options.hooks.doAction.bind(options.hooks),
    applyFilters: options.hooks.applyFilters.bind(options.hooks),
    dispose: () => {
      for (const off of disposers.splice(0)) off();
    },
  } as HookRegistry;

  const api: PluginRuntimeApi = {
    plugin: {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      dir,
    },
    hooks,
    options: scopedOptions(options.prisma, manifest.id),
    log: (message, meta) => options.logger?.(`[plugin:${manifest.id}] ${message}`, meta),
  };

  let module: PluginModule | null = null;
  try {
    const loaded = (await import(pathToFileURL(modulePath).href)) as PluginModule;
    module = loaded;
  } catch (error) {
    // A package without a module is valid: it may contribute only manifest
    // behaviour (e.g. toolbar lyrics).
    if ((error as { code?: string }).code !== 'ERR_MODULE_NOT_FOUND') {
      throw error;
    }
  }

  if (module?.activate) {
    try {
      await module.activate(api);
    } catch (error) {
      for (const off of disposers.splice(0)) off();
      throw error;
    }
  }

  return {
    id: manifest.id,
    async dispose() {
      try {
        if (module?.deactivate) await module.deactivate(api);
      } finally {
        for (const off of disposers.splice(0)) off();
      }
    },
  };
}
