import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import HomePage from '../app/page';

describe('public placeholder', () => {
  it('renders the MERNPress heading and real foundation links', () => {
    const html = renderToStaticMarkup(createElement(HomePage));

    expect(html).toContain('MERNPress');
    expect(html).toContain('Phase 1');
    expect(html).toContain('http://localhost:5173');
    expect(html).toContain('http://127.0.0.1:4000/api/health');
  });
});
