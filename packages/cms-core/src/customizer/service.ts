import type { DatabaseClient } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';
import {
  validateColors,
  validateCustomCss,
  validateMenu,
  type CustomizerSettings,
} from './validation.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const KEYS = {
  colors: 'customizer_colors',
  menu: 'customizer_menu',
  css: 'customizer_css',
  showOnFront: 'show_on_front',
  pageOnFront: 'page_on_front',
  pageForPosts: 'page_for_posts',
} as const;

export interface CustomizerServiceOptions {
  prisma: DatabaseClient;
}

export interface CustomizerUpdateInput {
  colors: unknown;
  menu: unknown;
  css: unknown;
  showOnFront: unknown;
  pageOnFront: unknown;
  pageForPosts: unknown;
}

function parse<T>(value: string | undefined, fallback: T): T {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function createCustomizerService({ prisma }: CustomizerServiceOptions) {
  async function read(): Promise<CustomizerSettings> {
    const rows = await prisma.option.findMany({
      where: { key: { in: Object.values(KEYS) } },
    });
    const values = new Map(rows.map((row) => [row.key, row.value]));
    return {
      colors: parse(values.get(KEYS.colors), null),
      menu: parse(values.get(KEYS.menu), null),
      css: parse(values.get(KEYS.css), null),
      showOnFront: parse<'posts' | 'page'>(values.get(KEYS.showOnFront), 'posts'),
      pageOnFront: parse<string | null>(values.get(KEYS.pageOnFront), null),
      pageForPosts: parse<string | null>(values.get(KEYS.pageForPosts), null),
    };
  }

  async function get(principal: Principal): Promise<CustomizerSettings> {
    requireCapability(principal, 'manage_options');
    return read();
  }

  async function publishedPage(id: string, field: string): Promise<string> {
    if (!UUID_PATTERN.test(id)) {
      throw new ContentError('VALIDATION_ERROR', `${field} must be a page.`, 400);
    }
    const page = await prisma.post.findUnique({
      where: { id },
      select: { type: true, status: true },
    });
    if (!page || page.type !== 'page' || page.status !== 'PUBLISHED') {
      throw new ContentError('VALIDATION_ERROR', `${field} must be a published page.`, 400);
    }
    return id;
  }

  async function update(
    principal: Principal,
    input: CustomizerUpdateInput,
  ): Promise<CustomizerSettings> {
    requireCapability(principal, 'manage_options');
    const colors = validateColors(input.colors);
    const menu = validateMenu(input.menu);
    const css = validateCustomCss(input.css);
    if (input.showOnFront !== 'posts' && input.showOnFront !== 'page') {
      throw new ContentError('VALIDATION_ERROR', 'Choose a homepage setting.', 400);
    }
    let pageOnFront =
      typeof input.pageOnFront === 'string' && input.pageOnFront.length > 0
        ? input.pageOnFront
        : null;
    let pageForPosts =
      typeof input.pageForPosts === 'string' && input.pageForPosts.length > 0
        ? input.pageForPosts
        : null;
    if (input.pageOnFront !== null && typeof input.pageOnFront !== 'string') {
      throw new ContentError('VALIDATION_ERROR', 'Invalid front page.', 400);
    }
    if (input.pageForPosts !== null && typeof input.pageForPosts !== 'string') {
      throw new ContentError('VALIDATION_ERROR', 'Invalid posts page.', 400);
    }
    if (input.showOnFront === 'page') {
      if (!pageOnFront) {
        throw new ContentError('VALIDATION_ERROR', 'Choose a homepage.', 400);
      }
      pageOnFront = await publishedPage(pageOnFront, 'The homepage');
    } else {
      pageOnFront = null;
      pageForPosts = null;
    }
    if (pageForPosts) {
      pageForPosts = await publishedPage(pageForPosts, 'The posts page');
    }
    if (pageOnFront && pageForPosts && pageOnFront === pageForPosts) {
      throw new ContentError(
        'VALIDATION_ERROR',
        'The homepage and posts page must be different.',
        400,
      );
    }

    const entries: Array<[string, unknown]> = [
      [KEYS.colors, colors],
      [KEYS.menu, menu],
      [KEYS.css, css],
      [KEYS.showOnFront, input.showOnFront],
      [KEYS.pageOnFront, pageOnFront],
      [KEYS.pageForPosts, pageForPosts],
    ];
    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.option.upsert({
          where: { key },
          create: { key, value: JSON.stringify(value), group: 'appearance' },
          update: { value: JSON.stringify(value), group: 'appearance' },
        }),
      ),
    );
    return read();
  }

  return { get, update };
}

export type CustomizerService = ReturnType<typeof createCustomizerService>;
