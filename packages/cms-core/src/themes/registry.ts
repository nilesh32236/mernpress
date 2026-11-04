/**
 * Installed theme registry.
 *
 * MERNPress ships one trusted theme package: the public site in `apps/web`.
 * Themes are not uploaded or downloaded at runtime (see ADR 0011), so this
 * registry is the single source of truth for the Appearance screen.
 */
export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  author: { name: string; url: string | null };
  description: string;
  tags: string[];
  /** Path (under the admin public dir) to the theme screenshot. */
  screenshot: string;
  /** Theme supports, shown in Theme Details like WordPress's feature list. */
  features: string[];
  /** Font families the theme ships (Appearance → Fonts). */
  fonts: ThemeFont[];
}

export interface ThemeFont {
  family: string;
  weights: number[];
  /** How the font is delivered: bundled with the theme or a system stack. */
  source: 'theme' | 'system';
}

export const THEMES: readonly ThemeManifest[] = [
  {
    id: 'mernpress',
    name: 'MERNPress',
    version: '0.1.0',
    author: { name: 'MERNPress', url: null },
    description:
      'The default MERNPress theme. A block theme for the public site: blog index, single posts and pages, category, tag and author archives, search, comments and a site editor-ready header and footer. It is built on the same block contracts as the admin editor, so published block markup renders server-side.',
    tags: [
      'Blog',
      'One Column',
      'Block Editor Styles',
      'Custom Colors',
      'Editor Style',
      'Featured Images',
      'Full Site Editing',
      'News',
      'Accessibility Ready',
    ],
    screenshot: '/theme-screenshot.png',
    features: [
      'Block editor styles',
      'Featured images',
      'Full site editing',
      'Threaded comments',
      'Wide blocks',
    ],
    fonts: [
      { family: 'Manrope', weights: [300, 400, 600, 700], source: 'theme' },
      { family: 'System UI', weights: [400, 600], source: 'system' },
    ],
  },
];

export const DEFAULT_THEME_ID = 'mernpress';

export function findTheme(id: string): ThemeManifest | undefined {
  return THEMES.find((theme) => theme.id === id);
}
