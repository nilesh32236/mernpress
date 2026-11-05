import { normalizePattern, validatePattern, validateTermBase } from '@mernpress/contracts';
import { validateColors, validateCustomCss, validateMenu } from '../customizer/validation.js';
import type { DatabaseClient, Prisma } from '@mernpress/database';
import { ContentError } from '../content/errors.js';
import { requireCapability } from '../auth/capabilities.js';
import type { Principal } from '../content/types.js';
import type { OptionGroup, SiteSettings, UpdateOptionsInput } from './types.js';

export interface OptionServiceOptions {
  prisma: DatabaseClient;
}

const ALLOWED_GROUPS: ReadonlySet<string> = new Set([
  'general',
  'reading',
  'writing',
  'discussion',
  'media',
  'permalinks',
  'privacy',
  'appearance',
]);

type Validator = (value: unknown) => unknown;

interface OptionSpec {
  group: OptionGroup;
  defaultValue: unknown;
  validate: Validator;
}

function isUuid(value: string): boolean {
  // Accept any RFC 9562 UUID version (this project uses UUIDv7 primary keys).
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function throwValidation(message: string): never {
  throw new ContentError('VALIDATION_ERROR', message, 400);
}

function throwUnknownKey(key: string): never {
  throw new ContentError('UNKNOWN_OPTION_KEY', `Unknown option key: ${key}`, 400);
}

function emailValid(value: string): boolean {
  if (value === '') {
    return true;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function urlValid(value: string): boolean {
  if (value === '') {
    return true;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const SPECS: Record<string, OptionSpec> = {
  site_title: {
    group: 'general',
    defaultValue: 'MERNPress',
    validate: (value) => {
      if (typeof value !== 'string') {
        throwValidation('site_title must be a string.');
      }
      if (value.length > 200) {
        throwValidation('site_title must be at most 200 characters.');
      }
      return value;
    },
  },
  site_tagline: {
    group: 'general',
    defaultValue: '',
    validate: (value) => {
      if (typeof value !== 'string') {
        throwValidation('site_tagline must be a string.');
      }
      if (value.length > 300) {
        throwValidation('site_tagline must be at most 300 characters.');
      }
      return value;
    },
  },
  admin_email: {
    group: 'general',
    defaultValue: '',
    validate: (value) => {
      if (typeof value !== 'string') {
        throwValidation('admin_email must be a string.');
      }
      if (!emailValid(value)) {
        throwValidation('admin_email must be a valid email address.');
      }
      return value;
    },
  },
  site_url: {
    group: 'general',
    defaultValue: '',
    validate: (value) => {
      if (typeof value !== 'string') {
        throwValidation('site_url must be a string.');
      }
      if (!urlValid(value)) {
        throwValidation('site_url must be a valid http(s) URL.');
      }
      return value;
    },
  },
  wordpress_url: {
    group: 'general',
    defaultValue: '',
    validate: (value) => {
      if (typeof value !== 'string') {
        throwValidation('wordpress_url must be a string.');
      }
      if (!urlValid(value)) {
        throwValidation('wordpress_url must be a valid http(s) URL.');
      }
      return value;
    },
  },
  default_role: {
    group: 'general',
    defaultValue: 'subscriber',
    validate: (value) => {
      const roles = ['administrator', 'editor', 'author', 'contributor', 'subscriber'];
      if (typeof value !== 'string' || !roles.includes(value)) {
        throwValidation('default_role must be a valid role.');
      }
      return value;
    },
  },
  users_can_register: {
    group: 'general',
    defaultValue: false,
    validate: (value) => {
      if (typeof value !== 'boolean') {
        throwValidation('users_can_register must be a boolean.');
      }
      return value;
    },
  },
  site_language: {
    group: 'general',
    defaultValue: 'en_US',
    validate: (value) => {
      if (typeof value !== 'string' || value.length > 20) {
        throwValidation('site_language must be a short locale code.');
      }
      return value;
    },
  },
  timezone: {
    group: 'general',
    defaultValue: 'UTC',
    validate: (value) => {
      if (typeof value !== 'string' || value.length > 64) {
        throwValidation('timezone must be a timezone string.');
      }
      return value;
    },
  },
  date_format: {
    group: 'general',
    defaultValue: 'F j, Y',
    validate: (value) => {
      if (typeof value !== 'string' || value.length > 40) {
        throwValidation('date_format must be a short pattern.');
      }
      return value;
    },
  },
  time_format: {
    group: 'general',
    defaultValue: 'g:i a',
    validate: (value) => {
      if (typeof value !== 'string' || value.length > 40) {
        throwValidation('time_format must be a short pattern.');
      }
      return value;
    },
  },
  week_starts_on: {
    group: 'general',
    defaultValue: 1,
    validate: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 6) {
        throwValidation('week_starts_on must be 0-6.');
      }
      return value;
    },
  },
  site_icon: {
    group: 'general',
    defaultValue: null,
    validate: (value) => {
      if (value === null) return null;
      if (typeof value !== 'string' || !isUuid(value)) {
        throwValidation('site_icon must be a media UUID or null.');
      }
      return value;
    },
  },
  homepage_mode: {
    group: 'reading',
    defaultValue: 'latest_posts',
    validate: (value) => {
      if (value !== 'latest_posts' && value !== 'static_page') {
        throwValidation("homepage_mode must be 'latest_posts' or 'static_page'.");
      }
      return value;
    },
  },
  homepage_id: {
    group: 'reading',
    defaultValue: null,
    validate: (value) => {
      if (value === null) {
        return null;
      }
      if (typeof value !== 'string' || !isUuid(value)) {
        throwValidation('homepage_id must be a UUID or null.');
      }
      return value;
    },
  },
  posts_page_id: {
    group: 'reading',
    defaultValue: null,
    validate: (value) => {
      if (value === null) {
        return null;
      }
      if (typeof value !== 'string' || !isUuid(value)) {
        throwValidation('posts_page_id must be a UUID or null.');
      }
      return value;
    },
  },
  posts_per_page: {
    group: 'reading',
    defaultValue: 10,
    validate: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throwValidation('posts_per_page must be an integer.');
      }
      if (value < 1 || value > 100) {
        throwValidation('posts_per_page must be between 1 and 100.');
      }
      return value;
    },
  },
  blog_public: {
    group: 'reading',
    defaultValue: true,
    validate: (value) => {
      if (typeof value !== 'boolean') {
        throwValidation('blog_public must be a boolean.');
      }
      return value;
    },
  },
  posts_per_rss: {
    group: 'reading',
    defaultValue: 10,
    validate: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throwValidation('posts_per_rss must be an integer.');
      }
      if (value < 1 || value > 100) {
        throwValidation('posts_per_rss must be between 1 and 100.');
      }
      return value;
    },
  },
  rss_use_excerpt: {
    group: 'reading',
    defaultValue: false,
    validate: (value) => {
      if (typeof value !== 'boolean') {
        throwValidation('rss_use_excerpt must be a boolean.');
      }
      return value;
    },
  },
  default_post_category: {
    group: 'writing',
    defaultValue: null,
    validate: (value) => {
      if (value === null) {
        return null;
      }
      if (typeof value !== 'string') {
        throwValidation('default_post_category must be a string or null.');
      }
      if (value.length > 200) {
        throwValidation('default_post_category must be at most 200 characters.');
      }
      return value;
    },
  },
  default_post_format: {
    group: 'writing',
    defaultValue: 'standard',
    validate: (value) => {
      const formats = [
        'standard',
        'aside',
        'gallery',
        'image',
        'link',
        'quote',
        'status',
        'video',
        'audio',
        'chat',
      ];
      if (typeof value !== 'string' || !formats.includes(value)) {
        throwValidation('default_post_format is not a supported format.');
      }
      return value;
    },
  },
  default_author: {
    group: 'writing',
    defaultValue: null,
    validate: (value) => {
      if (value === null) {
        return null;
      }
      if (typeof value !== 'string' || !isUuid(value)) {
        throwValidation('default_author must be a UUID or null.');
      }
      return value;
    },
  },
  mailserver_url: {
    group: 'writing',
    defaultValue: 'mail.example.com',
    validate: (value) => {
      if (typeof value !== 'string' || value.length > 200) {
        throwValidation('mailserver_url must be a short host name.');
      }
      return value;
    },
  },
  mailserver_port: {
    group: 'writing',
    defaultValue: 110,
    validate: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
        throwValidation('mailserver_port must be 1-65535.');
      }
      return value;
    },
  },
  mailserver_login: {
    group: 'writing',
    defaultValue: '',
    validate: (value) => {
      if (typeof value !== 'string' || value.length > 200) {
        throwValidation('mailserver_login must be a short string.');
      }
      return value;
    },
  },
  mailserver_pass: {
    group: 'writing',
    defaultValue: '',
    validate: (value) => {
      if (typeof value !== 'string' || value.length > 200) {
        throwValidation('mailserver_pass must be a short string.');
      }
      return value;
    },
  },
  default_email_category: {
    group: 'writing',
    defaultValue: 'uncategorized',
    validate: (value) => {
      if (typeof value !== 'string' || value.length > 200) {
        throwValidation('default_email_category must be a category slug.');
      }
      return value;
    },
  },
  ping_sites: {
    group: 'writing',
    defaultValue:
      'http://rpc.pingomatic.com/\nhttp://rpc.twingly.com/\nhttp://api.feedster.com/ping\nhttp://api.moreover.com/RPC2\nhttp://api.moreover.com/ping\nhttp://www.blogdigger.com/RPC2\nhttp://www.blogshares.com/rpc.php\nhttp://www.blogsnow.com/ping\nhttp://www.blogstreet.com/xrbin/xmlrpc.cgi\nhttp://bulkfeeds.net/rpc\nhttp://www.newsisfree.com/xmlrpctest.php\nhttp://ping.blo.gs/\nhttp://ping.feedburner.com\nhttp://ping.syndic8.com/xmlrpc.php\nhttp://ping.weblogalot.com/rpc.php\nhttp://rpc.blogrolling.com/pinger/\nhttp://rpc.technorati.com/rpc/ping\nhttp://rpc.weblogs.com/RPC2\nhttp://www.feedsubmitter.com\nhttp://blo.gs/ping.php\nhttp://www.pingerati.net/\nhttp://www.pingmyblog.com\nhttp://geourl.org/ping\nhttp://ipings.com\nhttp://www.weblogalot.com/ping',
    validate: (value) => {
      if (typeof value !== 'string' || value.length > 5000) {
        throwValidation('ping_sites must be a list of URLs.');
      }
      return value;
    },
  },
  default_comment_status: {
    group: 'discussion',
    defaultValue: 'open',
    validate: (value) => {
      if (value !== 'open' && value !== 'closed') {
        throwValidation("default_comment_status must be 'open' or 'closed'.");
      }
      return value;
    },
  },
  comments_per_page: {
    group: 'discussion',
    defaultValue: 50,
    validate: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 200) {
        throwValidation('comments_per_page must be 1-200.');
      }
      return value;
    },
  },
  default_comments_page: {
    group: 'discussion',
    defaultValue: 'newest',
    validate: (value) => {
      if (value !== 'newest' && value !== 'oldest') {
        throwValidation("default_comments_page must be 'newest' or 'oldest'.");
      }
      return value;
    },
  },
  comment_order: {
    group: 'discussion',
    defaultValue: 'asc',
    validate: (value) => {
      if (value !== 'asc' && value !== 'desc') {
        throwValidation("comment_order must be 'asc' or 'desc'.");
      }
      return value;
    },
  },
  require_name_email: {
    group: 'discussion',
    defaultValue: true,
    validate: (value) => {
      if (typeof value !== 'boolean') throwValidation('require_name_email must be a boolean.');
      return value;
    },
  },
  comment_registration: {
    group: 'discussion',
    defaultValue: false,
    validate: (value) => {
      if (typeof value !== 'boolean') throwValidation('comment_registration must be a boolean.');
      return value;
    },
  },
  close_comments_for_old_posts: {
    group: 'discussion',
    defaultValue: false,
    validate: (value) => {
      if (typeof value !== 'boolean') {
        throwValidation('close_comments_for_old_posts must be a boolean.');
      }
      return value;
    },
  },
  close_comments_days_old: {
    group: 'discussion',
    defaultValue: 14,
    validate: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 3650) {
        throwValidation('close_comments_days_old must be 1-3650.');
      }
      return value;
    },
  },
  thread_comments: {
    group: 'discussion',
    defaultValue: true,
    validate: (value) => {
      if (typeof value !== 'boolean') throwValidation('thread_comments must be a boolean.');
      return value;
    },
  },
  thread_comments_depth: {
    group: 'discussion',
    defaultValue: 5,
    validate: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10) {
        throwValidation('thread_comments_depth must be 1-10.');
      }
      return value;
    },
  },
  page_comments: {
    group: 'discussion',
    defaultValue: false,
    validate: (value) => {
      if (typeof value !== 'boolean') throwValidation('page_comments must be a boolean.');
      return value;
    },
  },
  comment_moderation: {
    group: 'discussion',
    defaultValue: false,
    validate: (value) => {
      if (typeof value !== 'boolean') throwValidation('comment_moderation must be a boolean.');
      return value;
    },
  },
  comment_previously_approved: {
    group: 'discussion',
    defaultValue: true,
    validate: (value) => {
      if (typeof value !== 'boolean') {
        throwValidation('comment_previously_approved must be a boolean.');
      }
      return value;
    },
  },
  show_avatars: {
    group: 'discussion',
    defaultValue: true,
    validate: (value) => {
      if (typeof value !== 'boolean') throwValidation('show_avatars must be a boolean.');
      return value;
    },
  },
  avatar_rating: {
    group: 'discussion',
    defaultValue: 'G',
    validate: (value) => {
      const ratings = ['G', 'PG', 'R', 'X'];
      if (typeof value !== 'string' || !ratings.includes(value)) {
        throwValidation('avatar_rating must be G, PG, R or X.');
      }
      return value;
    },
  },
  comment_max_links: {
    group: 'discussion',
    defaultValue: 2,
    validate: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
        throwValidation('comment_max_links must be 0-100.');
      }
      return value;
    },
  },
  moderation_keys: {
    group: 'discussion',
    defaultValue: '',
    validate: (value) => {
      if (typeof value !== 'string' || value.length > 5000) {
        throwValidation('moderation_keys must be a short list.');
      }
      return value;
    },
  },
  disallowed_keys: {
    group: 'discussion',
    defaultValue: '',
    validate: (value) => {
      if (typeof value !== 'string' || value.length > 5000) {
        throwValidation('disallowed_keys must be a short list.');
      }
      return value;
    },
  },
  spam_guard_enabled: {
    group: 'discussion',
    defaultValue: true,
    validate: (value) => {
      if (typeof value !== 'boolean') throwValidation('spam_guard_enabled must be a boolean.');
      return value;
    },
  },
  spam_guard_spam_threshold: {
    group: 'discussion',
    defaultValue: 6,
    validate: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 20) {
        throwValidation('spam_guard_spam_threshold must be 1-20.');
      }
      return value;
    },
  },
  spam_guard_moderation_threshold: {
    group: 'discussion',
    defaultValue: 3,
    validate: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 20) {
        throwValidation('spam_guard_moderation_threshold must be 1-20.');
      }
      return value;
    },
  },
  comments_notify: {
    group: 'discussion',
    defaultValue: true,
    validate: (value) => {
      if (typeof value !== 'boolean') throwValidation('comments_notify must be a boolean.');
      return value;
    },
  },
  notes_notify: {
    group: 'discussion',
    defaultValue: true,
    validate: (value) => {
      if (typeof value !== 'boolean') throwValidation('notes_notify must be a boolean.');
      return value;
    },
  },
  moderation_notify: {
    group: 'discussion',
    defaultValue: true,
    validate: (value) => {
      if (typeof value !== 'boolean') throwValidation('moderation_notify must be a boolean.');
      return value;
    },
  },
  thumbnail_size_w: {
    group: 'media',
    defaultValue: 150,
    validate: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5000) {
        throwValidation('thumbnail_size_w must be 0-5000.');
      }
      return value;
    },
  },
  thumbnail_size_h: {
    group: 'media',
    defaultValue: 150,
    validate: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5000) {
        throwValidation('thumbnail_size_h must be 0-5000.');
      }
      return value;
    },
  },
  thumbnail_crop: {
    group: 'media',
    defaultValue: true,
    validate: (value) => {
      if (typeof value !== 'boolean') throwValidation('thumbnail_crop must be a boolean.');
      return value;
    },
  },
  medium_size_w: {
    group: 'media',
    defaultValue: 300,
    validate: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5000) {
        throwValidation('medium_size_w must be 0-5000.');
      }
      return value;
    },
  },
  medium_size_h: {
    group: 'media',
    defaultValue: 300,
    validate: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5000) {
        throwValidation('medium_size_h must be 0-5000.');
      }
      return value;
    },
  },
  large_size_w: {
    group: 'media',
    defaultValue: 1024,
    validate: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10000) {
        throwValidation('large_size_w must be 0-10000.');
      }
      return value;
    },
  },
  large_size_h: {
    group: 'media',
    defaultValue: 1024,
    validate: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10000) {
        throwValidation('large_size_h must be 0-10000.');
      }
      return value;
    },
  },
  uploads_use_yearmonth_folders: {
    group: 'media',
    defaultValue: true,
    validate: (value) => {
      if (typeof value !== 'boolean') {
        throwValidation('uploads_use_yearmonth_folders must be a boolean.');
      }
      return value;
    },
  },
  permalink_structure: {
    group: 'permalinks',
    defaultValue: null,
    validate: (value) => {
      if (value === null || value === '') return null;
      if (
        typeof value !== 'string' ||
        !['plain', 'day', 'month', 'numeric', 'postname', 'custom'].includes(value)
      ) {
        throwValidation('permalink_structure must be a known permalink preset.');
      }
      return value;
    },
  },
  permalink_pattern: {
    group: 'permalinks',
    defaultValue: null,
    validate: (value) => {
      if (value === null || value === '') return null;
      if (typeof value !== 'string') {
        throwValidation('permalink_pattern must be a string or null.');
      }
      const checked = validatePattern(value);
      if (!checked.ok) {
        throwValidation(checked.reason);
      }
      return checked.pattern;
    },
  },
  category_base: {
    group: 'permalinks',
    defaultValue: 'category',
    validate: (value) => {
      if (typeof value !== 'string') {
        throwValidation('category_base must be a short URL slug.');
      }
      try {
        return validateTermBase(value, 'category');
      } catch {
        throwValidation('category_base must be a short URL slug.');
      }
    },
  },
  tag_base: {
    group: 'permalinks',
    defaultValue: 'tag',
    validate: (value) => {
      if (typeof value !== 'string') {
        throwValidation('tag_base must be a short URL slug.');
      }
      try {
        return validateTermBase(value, 'tag');
      } catch {
        throwValidation('tag_base must be a short URL slug.');
      }
    },
  },
  customizer_colors: {
    group: 'appearance',
    defaultValue: null,
    validate: (value) => validateColors(value),
  },
  customizer_menu: {
    group: 'appearance',
    defaultValue: null,
    validate: (value) => validateMenu(value),
  },
  customizer_css: {
    group: 'appearance',
    defaultValue: null,
    validate: (value) => validateCustomCss(value),
  },
  show_on_front: {
    group: 'appearance',
    defaultValue: 'posts',
    validate: (value) => {
      if (value !== 'posts' && value !== 'page') {
        throwValidation('show_on_front must be posts or page.');
      }
      return value;
    },
  },
  page_on_front: {
    group: 'appearance',
    defaultValue: null,
    validate: (value) => {
      if (value === null || value === '') return null;
      if (typeof value !== 'string' || !isUuid(value)) {
        throwValidation('page_on_front must be a page UUID or null.');
      }
      return value;
    },
  },
  page_for_posts: {
    group: 'appearance',
    defaultValue: null,
    validate: (value) => {
      if (value === null || value === '') return null;
      if (typeof value !== 'string' || !isUuid(value)) {
        throwValidation('page_for_posts must be a page UUID or null.');
      }
      return value;
    },
  },
  permalink_base: {
    group: 'permalinks',
    defaultValue: 'posts',
    validate: (value) => {
      if (
        typeof value !== 'string' ||
        !/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(value) ||
        ['admin', 'api', 'author', 'category', 'feed', 'preview', 'search', 'tag'].includes(value)
      ) {
        throwValidation('permalink_base must be a short URL slug.');
      }
      return value;
    },
  },
  wp_page_for_privacy_policy: {
    group: 'privacy',
    defaultValue: null,
    validate: (value) => {
      if (value === null) return null;
      if (typeof value !== 'string' || !isUuid(value)) {
        throwValidation('wp_page_for_privacy_policy must be a page UUID or null.');
      }
      return value;
    },
  },
};

function keysForGroups(groups: readonly string[]): string[] {
  return Object.keys(SPECS).filter((key) => groups.includes(SPECS[key]!.group));
}

export function createOptionService(options: OptionServiceOptions) {
  const { prisma } = options;

  function requireAuth(principal: Principal | null | undefined): asserts principal is Principal {
    if (!principal) {
      throw new ContentError('UNAUTHENTICATED', 'Not authenticated', 401);
    }
  }

  async function readMerged(keys: string[]): Promise<Record<string, unknown>> {
    const rows = await prisma.option.findMany({ where: { key: { in: keys } } });
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const spec = SPECS[key]!;
      const raw = stored.get(key);
      if (raw === undefined) {
        result[key] = spec.defaultValue;
        continue;
      }
      try {
        result[key] = JSON.parse(raw);
      } catch {
        result[key] = spec.defaultValue;
      }
    }
    return result;
  }

  async function getOptions(
    principal: Principal,
    input?: { group?: string },
  ): Promise<Record<string, unknown>> {
    requireAuth(principal);

    let groups: string[];
    if (input?.group === undefined || input.group === '' || input.group === null) {
      groups = ['general', 'reading', 'writing', 'discussion', 'media', 'permalinks', 'privacy'];
    } else {
      if (!ALLOWED_GROUPS.has(input.group)) {
        throw new ContentError('INVALID_OPTION_GROUP', `Unknown option group: ${input.group}`, 400);
      }
      groups = [input.group];
    }

    const keys = keysForGroups(groups);
    return readMerged(keys);
  }

  async function updateOptions(
    principal: Principal,
    input: UpdateOptionsInput,
  ): Promise<Record<string, unknown>> {
    requireAuth(principal);
    requireCapability(principal, 'manage_options');

    const group = input?.group;
    if (typeof group !== 'string' || !ALLOWED_GROUPS.has(group)) {
      throw new ContentError('INVALID_OPTION_GROUP', `Unknown option group: ${String(group)}`, 400);
    }

    const values = input?.values;
    if (typeof values !== 'object' || values === null || Array.isArray(values)) {
      throw new ContentError('VALIDATION_ERROR', 'values must be an object.', 400);
    }

    const entries = Object.entries(values as Record<string, unknown>);
    const validated: Array<{ key: string; value: unknown }> = [];
    for (const [key, raw] of entries) {
      const spec = SPECS[key];
      if (!spec || spec.group !== group) {
        throwUnknownKey(key);
      }
      const value = spec!.validate(raw);
      validated.push({ key, value });
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const { key, value } of validated) {
        await tx.option.upsert({
          where: { key },
          create: {
            key,
            value: JSON.stringify(value),
            group,
          },
          update: {
            value: JSON.stringify(value),
            group,
          },
        });
      }
    });

    const keys = keysForGroups([group]);
    return readMerged(keys);
  }

  async function getPublicSettings(): Promise<SiteSettings> {
    const values = await readMerged([
      'site_title',
      'site_tagline',
      'blog_public',
      'posts_per_rss',
      'rss_use_excerpt',
      'permalink_base',
      'permalink_structure',
      'permalink_pattern',
      'category_base',
      'tag_base',
      'show_avatars',
      'customizer_colors',
      'customizer_menu',
      'customizer_css',
      'show_on_front',
      'page_on_front',
      'page_for_posts',
    ]);
    const pageIds = [values.page_on_front, values.page_for_posts].filter(
      (value): value is string => typeof value === 'string',
    );
    const pages =
      pageIds.length > 0
        ? await prisma.post.findMany({
            where: { id: { in: pageIds }, type: 'page', status: 'PUBLISHED' },
            select: { id: true, slug: true },
          })
        : [];
    const frontPage =
      typeof values.page_on_front === 'string'
        ? (pages.find((page) => page.id === values.page_on_front) ?? null)
        : null;
    const postsPage =
      typeof values.page_for_posts === 'string'
        ? (pages.find((page) => page.id === values.page_for_posts) ?? null)
        : null;

    return {
      siteTitle: typeof values.site_title === 'string' ? values.site_title : 'MERNPress',
      tagline: typeof values.site_tagline === 'string' ? values.site_tagline : '',
      blogPublic: values.blog_public !== false,
      postsPerRss:
        typeof values.posts_per_rss === 'number' && values.posts_per_rss > 0
          ? values.posts_per_rss
          : 10,
      rssUseExcerpt: values.rss_use_excerpt === true,
      permalinkBase:
        typeof values.permalink_base === 'string' && values.permalink_base
          ? values.permalink_base
          : 'posts',
      permalinkStructure: (() => {
        const stored = values.permalink_structure;
        if (
          typeof stored === 'string' &&
          ['plain', 'day', 'month', 'numeric', 'postname', 'custom'].includes(stored)
        ) {
          return stored as 'plain' | 'day' | 'month' | 'numeric' | 'postname' | 'custom';
        }
        return 'custom' as const;
      })(),
      permalinkPattern: (() => {
        if (values.permalink_structure === 'plain') return '';
        const legacyBase =
          typeof values.permalink_base === 'string' && values.permalink_base
            ? values.permalink_base
            : 'posts';
        const stored =
          typeof values.permalink_pattern === 'string' && values.permalink_pattern
            ? values.permalink_pattern
            : `/${legacyBase}/%postname%/`;
        return normalizePattern(stored);
      })(),
      categoryBase:
        typeof values.category_base === 'string' && values.category_base
          ? values.category_base
          : 'category',
      tagBase: typeof values.tag_base === 'string' && values.tag_base ? values.tag_base : 'tag',
      showAvatars: values.show_avatars !== false,
      customColors:
        typeof values.customizer_colors === 'object' && values.customizer_colors !== null
          ? (values.customizer_colors as SiteSettings['customColors'])
          : null,
      customMenu: Array.isArray(values.customizer_menu)
        ? (values.customizer_menu as SiteSettings['customMenu'])
        : null,
      customCss:
        typeof values.customizer_css === 'string' && values.customizer_css.length > 0
          ? values.customizer_css
          : null,
      showOnFront: values.show_on_front === 'page' && frontPage ? 'page' : 'posts',
      pageOnFrontSlug: frontPage?.slug ?? null,
      pageForPostsSlug: postsPage?.slug ?? null,
    };
  }

  return { getOptions, updateOptions, getPublicSettings };
}

export type OptionService = ReturnType<typeof createOptionService>;
