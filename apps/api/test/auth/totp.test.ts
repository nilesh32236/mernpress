import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotp,
  generateTotpSecret,
  otpauthUrl,
  verifyTotp,
} from '@mernpress/cms-core';

// RFC 6238 test key: ASCII "12345678901234567890".
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TOTP', () => {
  it('matches the RFC 6238 SHA-1 vector (truncated to six digits)', () => {
    expect(generateTotp(RFC_SECRET, 59_000)).toBe('287082');
  });

  it('round-trips base32 and generates 160-bit secrets', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    expect(base32Decode(RFC_SECRET).toString()).toBe('12345678901234567890');
  });

  it('accepts one period of drift and returns the matched counter', () => {
    const now = 1_700_000_000_000;
    const code = generateTotp(RFC_SECRET, now);
    expect(verifyTotp(RFC_SECRET, code, { timestampMs: now })).toEqual({
      valid: true,
      counter: Math.floor(now / 30_000),
    });
    expect(verifyTotp(RFC_SECRET, code, { timestampMs: now + 30_000 }).valid).toBe(true);
    expect(verifyTotp(RFC_SECRET, code, { timestampMs: now + 90_000 }).valid).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'abcdef', { timestampMs: now }).valid).toBe(false);
  });

  it('builds an otpauth URL with the expected parameters', () => {
    const url = otpauthUrl({ secret: RFC_SECRET, account: 'admin', issuer: 'MERNPress' });
    expect(url).toContain('otpauth://totp/MERNPress%3Aadmin?');
    expect(url).toContain(`secret=${RFC_SECRET}`);
    expect(url).toContain('digits=6');
    expect(url).toContain('period=30');
  });
});
