import type { Principal } from '../content/types.js';

export type OptionGroup = 'general' | 'reading' | 'writing';

export interface GetOptionsInput {
  group?: string;
}

export interface UpdateOptionsInput {
  group: string;
  values: Record<string, unknown>;
}

/** Public-safe site settings used by the web frontend. */
export interface SiteSettings {
  siteTitle: string;
  tagline: string;
  blogPublic: boolean;
  postsPerRss: number;
  rssUseExcerpt: boolean;
}

export interface OptionService {
  getOptions(principal: Principal, input?: GetOptionsInput): Promise<Record<string, unknown>>;
  updateOptions(principal: Principal, input: UpdateOptionsInput): Promise<Record<string, unknown>>;
  /** Anonymous read of the settings the public site is allowed to know. */
  getPublicSettings(): Promise<SiteSettings>;
}
