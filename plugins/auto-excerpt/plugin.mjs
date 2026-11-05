/**
 * Auto Excerpt — a trusted local MERNPress plugin.
 *
 * Demonstrates the plugin runtime contract: a package exports `activate(api)`
 * and registers typed filters. The hook is disposed automatically when the
 * plugin is deactivated or deleted.
 */

const EXCERPT_LENGTH = 160;

function plainText(markup) {
  return (
    markup
      // Remove block delimiters first so their JSON attributes never leak.
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0*39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function deriveExcerpt(content) {
  const text = plainText(content);
  if (!text) return null;
  if (text.length <= EXCERPT_LENGTH) return text;
  const cut = text.slice(0, EXCERPT_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function activate(api) {
  const fill = (draft) => {
    if (draft.excerpt && draft.excerpt.trim().length > 0) return draft;
    const excerpt = deriveExcerpt(draft.content);
    return excerpt ? { ...draft, excerpt } : draft;
  };

  api.hooks.addFilter('content.post.create', fill);
  api.hooks.addFilter('content.post.update', fill);
  api.log('auto excerpts enabled');
}
