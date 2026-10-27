import { HookRejectedError } from './types.js';
import type { FilterMap, HookLogger, HookRegistry, HookRegistryOptions } from './types.js';

interface Registered {
  priority: number;
  order: number;
  handler: (value: never) => unknown;
}

const DEFAULT_MAX_DEPTH = 8;

/**
 * Per-instance hook registry. No module-level mutable state and no global
 * singleton: each app instance owns its own registry, so tests and multiple app
 * instances stay isolated. `dispose()` clears every handler.
 */
export function createHookRegistry(options: HookRegistryOptions = {}): HookRegistry {
  const logger: HookLogger = options.logger ?? { warn: () => undefined };
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

  const actions = new Map<string, Registered[]>();
  const filters = new Map<string, Registered[]>();
  let nextOrder = 0;
  let depth = 0;

  function register(
    store: Map<string, Registered[]>,
    name: string,
    handler: (value: never) => unknown,
    priority: number,
  ): () => void {
    if (!Number.isInteger(priority)) {
      throw new TypeError(`Hook priority must be an integer, got ${String(priority)}`);
    }
    const list = store.get(name) ?? [];
    const entry: Registered = { priority, order: nextOrder, handler };
    nextOrder += 1;
    list.push(entry);
    list.sort((a, b) => a.priority - b.priority || a.order - b.order);
    store.set(name, list);

    return () => {
      const current = store.get(name);
      if (!current) {
        return;
      }
      const index = current.indexOf(entry);
      if (index >= 0) {
        current.splice(index, 1);
      }
    };
  }

  function enter(): void {
    depth += 1;
    if (depth > maxDepth) {
      depth -= 1;
      throw new HookRejectedError(`Hook recursion depth limit (${maxDepth}) exceeded`);
    }
  }

  function leave(): void {
    depth -= 1;
  }

  return {
    addAction(name, handler, priority = 10) {
      return register(actions, name, handler as (value: never) => unknown, priority);
    },

    addFilter(name, handler, priority = 10) {
      return register(filters, name, handler as (value: never) => unknown, priority);
    },

    async doAction(name, payload) {
      const list = actions.get(name);
      if (!list || list.length === 0) {
        return;
      }
      for (const entry of list) {
        try {
          enter();
          await entry.handler(payload as never);
        } catch {
          // Contained and sanitized: never include the payload (which may carry
          // content) in the log, and never fail a committed write.
          logger.warn(`hook action failed: ${name}`);
        } finally {
          leave();
        }
      }
    },

    async applyFilters(name, value) {
      const list = filters.get(name);
      if (!list || list.length === 0) {
        return value;
      }
      let current: FilterMap[typeof name] = value;
      for (const entry of list) {
        enter();
        try {
          const next = (await entry.handler(current as never)) as
            FilterMap[typeof name] | undefined;
          if (next === undefined || next === null) {
            throw new HookRejectedError(`Filter "${name}" must return a value`);
          }
          current = next;
        } finally {
          leave();
        }
      }
      return current;
    },

    dispose() {
      actions.clear();
      filters.clear();
      depth = 0;
    },
  };
}
