import { describe, expect, it } from 'vitest';
import { readingTime } from '../lib/reading-time';

describe('reading time', () => {
  it('counts words in rendered HTML and floors at one minute', () => {
    expect(readingTime('<p>Short note.</p>')).toEqual({ words: 2, minutes: 1 });
    expect(readingTime('')).toEqual({ words: 0, minutes: 1 });
    expect(readingTime(null)).toEqual({ words: 0, minutes: 1 });
  });

  it('ignores block delimiters, tags and entities', () => {
    const html = '<!-- wp:paragraph --><p>One two&nbsp;three &amp; four.</p><!-- /wp:paragraph -->';
    expect(readingTime(html).words).toBe(5);
  });

  it('rounds up to the next minute at 200 words per minute', () => {
    expect(readingTime('word '.repeat(200)).minutes).toBe(1);
    expect(readingTime('word '.repeat(201)).minutes).toBe(2);
    expect(readingTime('word '.repeat(400)).minutes).toBe(2);
    expect(readingTime('word '.repeat(401)).minutes).toBe(3);
  });
});
