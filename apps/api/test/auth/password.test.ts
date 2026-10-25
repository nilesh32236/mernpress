import { describe, expect, it } from 'vitest';
import {
  ARGON2_OPTIONS,
  hashPassword,
  passwordNeedsRehash,
  passwordPolicyError,
  verifyDummyPassword,
  verifyPassword,
} from '@mernpress/cms-core';

describe('password hashing', () => {
  it('uses Argon2id with the documented parameters and verifies correctly', async () => {
    const password = 'Correct horse battery staple';
    const hash = await hashPassword(password);

    expect(hash.startsWith('$argon2id$v=19$m=65536,t=3,p=1$')).toBe(true);
    expect(ARGON2_OPTIONS.memoryCost).toBe(65_536);
    expect(await verifyPassword(hash, password)).toBe(true);
    expect(await verifyPassword(hash, 'wrong password')).toBe(false);
    expect(passwordNeedsRehash(hash)).toBe(false);
  });

  it('never accepts an empty or short bootstrap password', () => {
    expect(passwordPolicyError('')).toMatch(/at least 12/);
    expect(passwordPolicyError('short')).toMatch(/at least 12/);
    expect(passwordPolicyError('            ')).toMatch(/non-whitespace/);
    expect(passwordPolicyError('Correct horse battery staple')).toBeNull();
  });

  it('performs dummy verification without throwing', async () => {
    await expect(verifyDummyPassword('wrong password')).resolves.toBeUndefined();
  });
});
