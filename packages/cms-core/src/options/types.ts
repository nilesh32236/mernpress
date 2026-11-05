import type { Principal } from '../content/types.js';
import type { CustomColors, CustomMenuItem } from '../customizer/validation.js';

export type OptionGroup =
  | 'general'
  | 'reading'
  | 'writing'
  | 'discussion'
  | 'media'
  | 'permalinks'
  | 'privacy'
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
}

export interface OptionService {
  getOptions(principal: Principal, input?: GetOptionsInput): Promise<Record<string, unknown>>;
  updateOptions(principal: Principal, input: UpdateOptionsInput): Promise<Record<string, unknown>>;
  /** Anonymous read of the settings the public site is allowed to know. */
  getPublicSettings(): Promise<SiteSettings>;
}
