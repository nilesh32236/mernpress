import { randomUUID } from 'node:crypto';
import { hash, parseOptions, verify } from '@node-rs/argon2';

export const ARGON2_OPTIONS = {
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
  // @node-rs/argon2's Algorithm is an ambient const enum, which cannot be
  // referenced under verbatimModuleSyntax. 2 is Argon2id in its public ABI.
  algorithm: 2,
} as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

let dummyHashPromise: Promise<string> | undefined;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hashString: string, password: string): Promise<boolean> {
  try {
    return await verify(hashString, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Verifies against a hash of a random throwaway password so an unknown username
 * takes a similar amount of work as a known username with a wrong password.
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHashPromise ??= hash(`dummy-${randomUUID()}`, ARGON2_OPTIONS);
  const dummyHash = await dummyHashPromise;
  await verifyPassword(dummyHash, password);
}

export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  if (password.trim().length === 0) {
    return 'Password must contain at least one non-whitespace character';
  }
  return null;
}

export function passwordNeedsRehash(hashString: string): boolean {
  try {
    const parsed = parseOptions(hashString);
    return (
      parsed.algorithm !== 2 ||
      parsed.memoryCost !== ARGON2_OPTIONS.memoryCost ||
      parsed.timeCost !== ARGON2_OPTIONS.timeCost ||
      parsed.parallelism !== ARGON2_OPTIONS.parallelism ||
      parsed.outputLen !== ARGON2_OPTIONS.outputLen
    );
  } catch {
    return true;
  }
}
