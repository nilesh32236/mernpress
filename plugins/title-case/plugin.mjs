/**
 * Title Case — trusted local MERNPress plugin.
 *
 * WordPress has no title-casing control; editors hand-fix capitalization on
 * every post. This plugin normalizes the draft title only: small words stay
 * lowercase unless first/last, all-caps words (acronyms) are preserved, and
 * the SEO title field is never touched.
 */

const SMALL_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'nor',
  'for',
  'so',
  'yet',
  'in',
  'on',
  'at',
  'to',
  'of',
  'by',
  'with',
  'from',
  'up',
  'as',
  'is',
  'it',
]);

function isAcronym(word) {
  const letters = word.replace(/[^A-Za-z]/g, '');
  return (
    letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()
  );
}

function titleCaseWord(word) {
  if (!word) return word;
  if (isAcronym(word)) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function titleCase(title) {
  const words = title.split(/(\s+)/);
  const lastIndex = words.reduce((last, _, index) => (words[index].trim() ? index : last), -1);
  return words
    .map((word, index) => {
      if (!word.trim()) return word;
      const lower = word.toLowerCase();
      const isSmall = SMALL_WORDS.has(lower);
      if (isSmall && index !== 0 && index !== lastIndex) return lower;
      return titleCaseWord(word);
    })
    .join('');
}

export function activate(api) {
  const normalize = (draft) => {
    if (typeof draft.title !== 'string' || draft.title.trim().length === 0) return draft;
    return { ...draft, title: titleCase(draft.title) };
  };
  api.hooks.addFilter('content.post.create', normalize);
  api.hooks.addFilter('content.post.update', normalize);
  api.log('Title case enabled');
}
