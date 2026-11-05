/** Words per minute used by the reading-time estimate. */
export const WORDS_PER_MINUTE = 200;

export interface ReadingTime {
  words: number;
  minutes: number;
}

function plainText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reading-time estimate for rendered content. One minute is the floor, so a
 * short note still reads as "1 min read" instead of "0 min read".
 */
export function readingTime(html: string | null | undefined): ReadingTime {
  if (!html) return { words: 0, minutes: 1 };
  const text = plainText(html);
  const words = text.length === 0 ? 0 : text.split(' ').filter(Boolean).length;
  return { words, minutes: Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)) };
}
