export { createAuthService } from './auth/service.js';
export { LOGIN_ATTEMPT_CLEANUP_BATCH } from './auth/rate-limit.js';
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
  ManualTestAccountInput,
  ManualTestRole,
  PublicUser,
  SessionValidation,
  UserRole,
  UserStatus,
} from './auth/types.js';

// ---- Phase 2 user administration + self-service profile (P2-05) ----
export {
  createUserAdminService,
  UserAdminError,
  type AdminUser,
  type ChangeOwnPasswordInput,
  type CreateUserInput,
  type DeleteUserOptions,
  type DeleteUserResult,
  type UpdateProfileInput,
  type UserAdminErrorCode,
  type UserAdminService,
  type UserAdminServiceOptions,
  type UserListQuery,
  type UserProfile,
} from './auth/users.js';

// ---- Phase 2 roles/capabilities (ADR 0004) ----
export {
  ownsObject,
  requireCapability,
  roleHasCapability,
  canReadPost,
  FULL_VISIBILITY_ROLES,
  type Capability,
  type Role,
} from './auth/capabilities.js';

// ---- Phase 3: content, taxonomy, hooks ----
export { createHookRegistry } from './hooks/registry.js';
export { HookRejectedError } from './hooks/types.js';
export type {
  ActionMap,
  FilterMap,
  HookLogger,
  HookRegistry,
  HookRegistryOptions,
} from './hooks/types.js';

export { createContentService, type ContentService } from './content/service.js';
export { ContentError, type ContentErrorCode } from './content/errors.js';
export {
  deriveSlugFromTitle,
  fallbackSlug,
  isReservedSlug,
  normalizeSlug,
  RESERVED_SLUGS,
  SLUG_MAX_LENGTH,
  truncateSlug,
  validateExplicitSlug,
} from './content/slug.js';
export type {
  AdminListQuery,
  AdminPost,
  AdminTermSummary,
  ContentType,
  CreatePostInput,
  Paged,
  PostActionPayload,
  PostFilterDraft,
  PostStatus,
  PostTermsActionPayload,
  Principal,
  PublicListQuery,
  PublicPost,
  UpdatePostInput,
} from './content/types.js';

export { createTaxonomyService, type TaxonomyService } from './taxonomy/service.js';
export type {
  AdminTerm,
  CreateTermInput,
  TaxonomyType,
  TermActionPayload,
  TermFilterDraft,
  TermListQuery,
  UpdateTermInput,
} from './taxonomy/types.js';

// ---- Options store (Settings) ----
export { createOptionService, type OptionService } from './options/service.js';
export { OptionError, type OptionErrorCode } from './options/errors.js';
export type { OptionGroup, GetOptionsInput, UpdateOptionsInput } from './options/types.js';
