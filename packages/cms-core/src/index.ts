export { createAuthService } from './auth/service.js';
export {
  ARGON2_OPTIONS,
  hashPassword,
  passwordNeedsRehash,
  passwordPolicyError,
  verifyDummyPassword,
  verifyPassword,
} from './auth/password.js';
export {
  generateOpaqueToken,
  hashCsrfToken,
  hashSessionToken,
  safeEqualHex,
  sha256Hex,
  verifyCsrfToken,
} from './auth/tokens.js';
export {
  normalizeUsername,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  usernamePolicyError,
} from './auth/username.js';
export { AuthError } from './auth/types.js';
export type {
  AuthConfig,
  AuthErrorCode,
  AuthService,
  BootstrapInput,
  LoginInput,
  LoginResult,
  PublicUser,
  SessionValidation,
  UserRole,
  UserStatus,
} from './auth/types.js';
