import { describe, expect, it } from 'vitest';
import { extractMentions } from '@mernpress/cms-core';

describe('editor-note mentions', () => {
  it('extracts valid, unique usernames and ignores emails', () => {
    expect(
      extractMentions(
        'Hi @Alice, @bob.doe and @Alice again. Mail me at me@example.com or @a, thanks.',
      ),
    ).toEqual(['alice', 'bob.doe']);
    expect(extractMentions('No mentions here.')).toEqual([]);
    expect(extractMentions('@bad! and @under_score and @dash-name')).toEqual([
      'bad',
      'under_score',
      'dash-name',
    ]);
  });

  it('caps mentions at ten per message', () => {
    const content = Array.from({ length: 12 }, (_, index) => `@user${index}`).join(' ');
    expect(extractMentions(content)).toHaveLength(10);
  });
});
