import { DEFAULT_THEME_STRINGS } from '@mernpress/contracts';
import { describe, expect, it } from 'vitest';
import { commentErrorMessage } from '../lib/comment-errors.js';

describe('comment error localization', () => {
  it('maps every stable reason to a theme string', () => {
    expect(commentErrorMessage(DEFAULT_THEME_STRINGS, 'comments_closed')).toBe(
      'Comments are closed.',
    );
    expect(commentErrorMessage(DEFAULT_THEME_STRINGS, 'login_required')).toBe(
      'You must be logged in to comment.',
    );
    expect(commentErrorMessage(DEFAULT_THEME_STRINGS, 'name_required')).toBe(
      'Please enter your name.',
    );
    expect(commentErrorMessage(DEFAULT_THEME_STRINGS, 'email_invalid')).toBe(
      'Please enter a valid email address.',
    );
    expect(commentErrorMessage(DEFAULT_THEME_STRINGS, 'content_required')).toBe(
      'Please write a comment.',
    );
    expect(commentErrorMessage(DEFAULT_THEME_STRINGS, 'content_too_long')).toBe(
      'Your comment is too long.',
    );
    expect(commentErrorMessage(DEFAULT_THEME_STRINGS, 'url_invalid')).toBe(
      'Please enter a valid website URL.',
    );
    expect(commentErrorMessage(DEFAULT_THEME_STRINGS, 'reply_missing')).toBe(
      'The comment you replied to is no longer available.',
    );
    expect(commentErrorMessage(DEFAULT_THEME_STRINGS, 'too_fast')).toBe(
      'You are posting comments too quickly. Please wait a moment.',
    );
  });

  it('uses the active language override and a localized fallback', () => {
    const strings = { ...DEFAULT_THEME_STRINGS, commentsClosed: 'टिप्पणियाँ बंद हैं।' };
    expect(commentErrorMessage(strings, 'comments_closed')).toBe('टिप्पणियाँ बंद हैं।');
    expect(commentErrorMessage(strings, 'not_a_reason')).toBe(strings.commentFailed);
    expect(commentErrorMessage(strings, undefined)).toBe(strings.commentFailed);
  });
});
