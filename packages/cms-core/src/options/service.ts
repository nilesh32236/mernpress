import type { DatabaseClient, Prisma } from '@mernpress/database';
import { ContentError } from '../content/errors.js';
import { requireCapability } from '../auth/capabilities.js';
import type { Principal } from '../content/types.js';
import type { OptionGroup, UpdateOptionsInput } from './types.js';

export interface OptionServiceOptions {
  prisma: DatabaseClient;
}

const ALLOWED_GROUPS: ReadonlySet<string> = new Set(['general', 'reading', 'writing']);

type Validator = (value: unknown) => unknown;

interface OptionSpec {
  group: OptionGroup;
  defaultValue: unknown;
  validate: Validator;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
    defaultValue: 'Y/m/d',
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
      groups = ['general', 'reading', 'writing'];
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

  return { getOptions, updateOptions };
}

export type OptionService = ReturnType<typeof createOptionService>;
