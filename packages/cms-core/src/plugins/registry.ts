/**
 * Bundled plugin registry.
 *
 * MERNPress has no plugin installer yet (Phase 9 owns the public plugin runtime,
 * manifest and discovery). This registry lists the plugins that ship in the
 * repository. Each entry is ordinary server code; activation is persisted and
 * consumed at runtime, but no third-party code is loaded.
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  /** Short "what it does" line shown in the details row, like WordPress. */
  details: string;
}

export const PLUGINS: readonly PluginManifest[] = [
  {
    id: 'hello-mernpress',
    name: 'Hello MERNPress',
    version: '1.0.0',
    author: 'The MERNPress team',
    description:
      'This is not just a plugin; it symbolizes the hope and enthusiasm of an entire project summed up in two words sung most famously by Louis Armstrong: Hello, MERNPress. When activated you will randomly see a lyric from the MERNPress songbook in the upper right of your admin screen on every page.',
    details: 'Shows a rotating lyric in the admin toolbar.',
  },
];

/** Lines shown by the Hello MERNPress plugin, in WordPress Hello Dolly style. */
export const HELLO_LYRICS: readonly string[] = [
  'Hello, MERNPress, well hello, MERNPress',
  "It's so nice to have you back where you belong",
  "You're lookin' swell, MERNPress, we can tell, MERNPress",
  "You're still glowin', you're still crowin', you're still goin' strong",
  'Blocks in the editor, posts on the wire',
  'Sanitised HTML, nothing to untire',
  'Hello, MERNPress, well hello, MERNPress',
  "It's so nice to have you back where you belong",
];

export function findPlugin(id: string): PluginManifest | undefined {
  return PLUGINS.find((plugin) => plugin.id === id);
}

export function lyricFor(seed: number): string {
  const index = Math.abs(Math.trunc(seed)) % HELLO_LYRICS.length;
  return HELLO_LYRICS[index] ?? HELLO_LYRICS[0]!;
}
