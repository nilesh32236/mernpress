/**
 * SEO Fallbacks — trusted local MERNPress plugin.
 *
 * Derives only from visible content; it never invents claims, scores keywords
 * or calls an external service. Authored SEO values are always preserved.
 */

const DESCRIPTION_LENGTH = 160;

function plainText(markup) {
  return markup
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

function clip(value) {
  if (value.length <= DESCRIPTION_LENGTH) return value;
  const cut = value.slice(0, DESCRIPTION_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function isBlank(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

export function activate(api) {
  const fill = (draft) => {
    const description = isBlank(draft.seoDescription)
      ? clip(!isBlank(draft.excerpt) ? draft.excerpt.trim() : plainText(draft.content))
      : draft.seoDescription;
    return {
      ...draft,
      seoDescription: description.length > 0 ? description : draft.seoDescription,
      ogTitle: isBlank(draft.ogTitle) ? (draft.seoTitle ?? draft.title) : draft.ogTitle,
      ogDescription: isBlank(draft.ogDescription) ? description : draft.ogDescription,
    };
  };

  api.hooks.addFilter('content.post.create', fill);
  api.hooks.addFilter('content.post.update', fill);
  api.log('SEO fallbacks enabled');
}
