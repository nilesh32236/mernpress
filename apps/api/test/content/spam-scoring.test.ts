import { describe, expect, it } from 'vitest';
import { assessComment, spamVerdict } from '@mernpress/cms-core';

function signals(overrides: Partial<Parameters<typeof assessComment>[0]> = {}) {
  return {
    content: 'A thoughtful comment about the article.',
    authorName: 'Reader',
    authorUrl: null,
    authorEmail: 'reader@example.com',
    duplicateCount: 0,
    linkCount: 0,
    ...overrides,
  };
}

describe('local comment spam scoring', () => {
  it('scores a clean comment at zero', () => {
    const assessment = assessComment(signals());
    expect(assessment.score).toBe(0);
    expect(assessment.reasons).toEqual([]);
    expect(spamVerdict(assessment.score, { spam: 6, moderation: 3 })).toBe('ham');
  });

  it('escalates links, spam phrases and shouting', () => {
    const assessment = assessComment(
      signals({
        content: 'CHEAP VIAGRA AND CASINO CHIPS ARE HERE !!!',
        linkCount: 2,
      }),
    );
    expect(assessment.score).toBeGreaterThanOrEqual(6);
    expect(assessment.reasons.join(' ')).toContain('spam phrases');
    expect(assessment.reasons.join(' ')).toContain('mostly uppercase');
    expect(spamVerdict(assessment.score, { spam: 6, moderation: 3 })).toBe('spam');
  });

  it('flags disposable email domains, BBCode and URLs in the author name', () => {
    expect(assessComment(signals({ authorEmail: 'bot@mailinator.com' })).score).toBe(3);
    expect(
      assessComment(signals({ content: '[url=https://example.com]buy[/url] here' })).reasons,
    ).toEqual(expect.arrayContaining([expect.stringContaining('BBCode')]));
    expect(assessComment(signals({ authorName: 'www.cheap-deals.example' })).score).toBe(2);
  });

  it('treats a repeated identical comment as strong evidence', () => {
    const assessment = assessComment(signals({ duplicateCount: 1 }));
    expect(assessment.score).toBe(5);
    expect(assessment.reasons.join(' ')).toContain('duplicate');
    expect(spamVerdict(assessment.score, { spam: 8, moderation: 5 })).toBe('moderate');
  });

  it('clamps an inverted threshold pair so moderation never exceeds spam', () => {
    expect(spamVerdict(5, { spam: 6, moderation: 9 })).toBe('ham');
    expect(spamVerdict(6, { spam: 6, moderation: 9 })).toBe('spam');
    expect(spamVerdict(2, { spam: 0, moderation: 0 })).toBe('spam');
    expect(spamVerdict(0, { spam: 0, moderation: 0 })).toBe('ham');
  });
});
