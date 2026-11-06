import type { ConsentConfig, LanguageConfig } from '@mernpress/contracts';
import type { Principal } from '../content/types.js';
import type { CustomColors, CustomMenuItem } from '../customizer/validation.js';
import type { ThemeStringsByLanguage } from '@mernpress/contracts';

export type OptionGroup =
  | 'general'
  | 'reading'
  | 'writing'
  | 'discussion'
  | 'media'
  | 'permalinks'
  | 'privacy'
  | 'consent'
  | 'appearance';

export interface GetOptionsInput {
  group?: string;
}

export interface UpdateOptionsInput {
  group: string;
  values: Record<string, unknown>;
}

/** Public-safe site settings used by the web frontend. */
import type { PermalinkPreset } from '@mernpress/contracts';

export interface SiteSettings {
  siteTitle: string;
  tagline: string;
  blogPublic: boolean;
  postsPerRss: number;
  rssUseExcerpt: boolean;
  /** Legacy single base; kept for clients that still read it. */
  permalinkBase: string;
  permalinkStructure: PermalinkPreset;
  /** Effective pattern ('' for Plain). */
  permalinkPattern: string;
  categoryBase: string;
  tagBase: string;
  showAvatars: boolean;
  /** Appearance → Customize overrides. */
  customColors: CustomColors | null;
  customMenu: CustomMenuItem[] | null;
  customCss: string | null;
  showOnFront: 'posts' | 'page';
  /** Slugs of the configured static front page and posts page. */
  pageOnFrontSlug: string | null;
  pageForPostsSlug: string | null;
  /** Cookie-consent banner configuration (public-safe). */
  consent: ConsentConfig;
  /** Enabled content languages and the default (public-safe). */
  languages: LanguageConfig;
  /** Per-language menu overrides (non-default languages); default uses customMenu. */
  languageMenus: Record<string, CustomMenuItem[]> | null;
  /** Per-language theme-string overrides (public-safe). */
  themeStrings: ThemeStringsByLanguage;
}

export interface OptionService {
  getOptions(principal: Principal, input?: GetOptionsInput): Promise<Record<string, unknown>>;
  updateOptions(principal: Principal, input: UpdateOptionsInput): Promise<Record<string, unknown>>;
  /** Anonymous read of the settings the public site is allowed to know. */
  getPublicSettings(): Promise<SiteSettings>;
}
