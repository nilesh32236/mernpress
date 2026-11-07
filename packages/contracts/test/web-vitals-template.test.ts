import { describe, expect, it } from 'vitest';
import { templateForPath } from '../src/web-vitals.js';

describe('vitals template classification', () => {
  it('maps public routes to templates without storing the path', () => {
    expect(templateForPath('/')).toBe('home');
    expect(templateForPath('/posts/hello')).toBe('post');
    expect(templateForPath('/about')).toBe('page');
    expect(templateForPath('/posts')).toBe('archive');
    expect(templateForPath('/category/news')).toBe('archive');
    expect(templateForPath('/tag/demo')).toBe('archive');
    expect(templateForPath('/author/admin')).toBe('archive');
    expect(templateForPath('/search?q=x')).toBe('search');
    expect(templateForPath('/feed')).toBe('other');
    expect(templateForPath('https://example.com/x')).toBe('other');
  });

  it('strips a language prefix before classifying', () => {
    expect(templateForPath('/hi/posts/hello')).toBe('post');
    expect(templateForPath('/hi/about')).toBe('page');
    expect(templateForPath('/pt-br/search')).toBe('search');
  });
});
