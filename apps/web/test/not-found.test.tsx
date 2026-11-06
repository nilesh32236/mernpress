import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/not-found-log', () => ({
  logCurrentNotFound: async () => undefined,
}));

vi.mock('@/lib/theme-strings', async () => {
  const { DEFAULT_THEME_STRINGS } = await import('@mernpress/contracts');
  return {
    requestThemeStrings: async () => ({
      ...DEFAULT_THEME_STRINGS,
      notFoundTitle: 'पृष्ठ नहीं मिला',
      notFoundText: 'यह पृष्ठ मौजूद नहीं है, या इसे स्थानांतरित कर दिया गया है।',
      notFoundImageAlt: 'पहाड़ी पर छोटा पेड़',
    }),
  };
});

import NotFound from '../app/not-found';

describe('not-found page', () => {
  it('renders the localized 404 copy, image alt and search form', async () => {
    const html = renderToStaticMarkup(await NotFound());
    expect(html).toContain('पृष्ठ नहीं मिला');
    expect(html).toContain('यह पृष्ठ मौजूद नहीं है');
    expect(html).toContain('alt="पहाड़ी पर छोटा पेड़"');
    expect(html).toContain('class="search-form"');
    expect(html).not.toContain('Page not found');
    expect(html).not.toContain('The page you are looking for');
  });
});
