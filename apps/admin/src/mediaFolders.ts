import type { MediaFolder } from './api.js';

/** Depth-first folder rows (children after their parent) for indented UI. */
export function folderTree(folders: MediaFolder[]): Array<{ folder: MediaFolder; depth: number }> {
  const byParent = new Map<string | null, MediaFolder[]>();
  for (const folder of folders) {
    const list = byParent.get(folder.parentId) ?? [];
    list.push(folder);
    byParent.set(folder.parentId, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  const rows: Array<{ folder: MediaFolder; depth: number }> = [];
  const seen = new Set<string>();
  const visit = (parentId: string | null, depth: number): void => {
    for (const folder of byParent.get(parentId) ?? []) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      rows.push({ folder, depth });
      visit(folder.id, depth + 1);
    }
  };
  visit(null, 0);
  // Defensive: a corrupt cycle or orphan row still appears at the top level.
  for (const folder of folders) {
    if (!seen.has(folder.id)) rows.push({ folder, depth: 0 });
  }
  return rows;
}

/** All folder ids below `id`, used to filter move targets. */
export function folderDescendants(folders: MediaFolder[], id: string): Set<string> {
  const byParent = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parentId) continue;
    const list = byParent.get(folder.parentId) ?? [];
    list.push(folder.id);
    byParent.set(folder.parentId, list);
  }
  const result = new Set<string>();
  const walk = (parentId: string): void => {
    for (const childId of byParent.get(parentId) ?? []) {
      if (result.has(childId)) continue;
      result.add(childId);
      walk(childId);
    }
  };
  walk(id);
  return result;
}

export function indentedFolder(name: string, depth: number): string {
  return `${'— '.repeat(depth)}${name}`;
}
