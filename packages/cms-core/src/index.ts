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
  AVAILABLE_LOCALES,
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
export { MAX_REVISIONS_PER_POST } from './content/revisions.js';
export {
  createScheduleService,
  MIN_SCHEDULE_LEAD_MS,
  MAX_SCHEDULE_LEAD_MS,
  SWEEP_BATCH_SIZE,
  type ScheduleService,
  type ScheduleState,
} from './content/schedule.js';
export {
  createBulkService,
  BULK_MAX_IDS,
  type BulkAction,
  type BulkItemInput,
  type BulkItemResult,
  type BulkResult,
  type BulkService,
} from './content/bulk.js';
export {
  createAutosaveService,
  type AutosaveService,
  type AutosaveSnapshot,
  type AutosaveState,
} from './content/autosave.js';
export {
  generatePreviewToken,
  isPreviewTokenFormat,
  PREVIEW_TOKEN_PATTERN,
  previewPathFor,
  safeEqualPreviewToken,
} from './content/preview.js';
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
  AdminRevision,
  AdminRevisionDetail,
  AdminTermSummary,
  ContentType,
  CreatePostInput,
  Paged,
  PostActionPayload,
  PostFilterDraft,
  PostStatus,
  PostTermsActionPayload,
  PreviewLinkResult,
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

// ---- Phase 6: media library (P6-01/P6-02/P6-03/P6-05) ----
export { createMediaService, type MediaServiceOptions } from './media/service.js';
export {
  MEDIA_ALLOWED_EXTENSIONS,
  MEDIA_ALLOWED_IMAGE_FORMATS,
  MEDIA_DERIVATIVE_WIDTHS,
  MEDIA_MAIN_MAX_DIMENSION,
  MEDIA_MAX_UPLOAD_BYTES,
  type MediaDerivativeWidth,
  type MediaDerivatives,
  type MediaDto,
  type MediaExtension,
  type MediaFile,
  type MediaListQuery,
  type MediaService,
  type UpdateMediaInput,
  type UploadMediaInput,
} from './media/types.js';

// ---- Comments (ADR 0009, expanded scope) ----
export { createCommentService, type CommentService } from './comments/service.js';
export type {
  AdminComment,
  CommentCounts,
  CommentListQuery,
  CommentStatus,
  CreateCommentInput,
  PublicComment,
  UpdateCommentInput,
} from './comments/types.js';

// ---- Appearance: installed themes (ADR 0011) ----
export { createThemeService, type ThemeService } from './themes/service.js';
export type { ThemeListResult, ThemeState } from './themes/service.js';
export { THEMES, DEFAULT_THEME_ID, findTheme, type ThemeManifest } from './themes/registry.js';

// ---- Plugins (ADR 0012) ----
export { createPluginService, type PluginService } from './plugins/service.js';
export type { PluginListResult, PluginState } from './plugins/service.js';
export {
  PLUGINS,
  HELLO_LYRICS,
  findPlugin,
  lyricFor,
  type PluginManifest,
} from './plugins/registry.js';

// ---- Update checks (ADR 0013) ----
export {
  createUpdateService,
  compareVersions,
  CORE_VERSION,
  type UpdateService,
} from './updates/service.js';
export type { UpdateItem, UpdateSource, UpdateStatus } from './updates/service.js';

// ---- Dashboard events and news (ADR 0014) ----
export {
  createDashboardFeedService,
  parseRssItems,
  DEFAULT_EVENTS_API_URL,
  DEFAULT_NEWS_FEED_URL,
  type DashboardFeedService,
} from './dashboard/service.js';
export type { DashboardEvent, DashboardFeeds, DashboardNews } from './dashboard/service.js';

// ---- Personal data requests (ADR 0016) ----
export { createPrivacyService, type PrivacyService } from './privacy/service.js';
export type {
  DataRequest,
  DataRequestStatus,
  DataRequestType,
  PersonalDataExport,
} from './privacy/service.js';

// ---- WordPress import (ADR 0016) ----
export { createImportService, parseWxr, type ImportService } from './import/service.js';
export type { ImportResult } from './import/service.js';

// ---- Settings connectors (ADR 0017) ----
export {
  createConnectorService,
  CONNECTOR_PROVIDERS,
  type ConnectorProvider,
  type ConnectorService,
} from './connectors/service.js';
export type { ConnectorState } from './connectors/service.js';

// ---- Lost-password reset flow ----
export {
  createPasswordResetService,
  type PasswordResetConfig,
  type PasswordResetService,
  type PasswordResetServiceOptions,
} from './auth/password-reset.js';

// ---- Application passwords (Profile self-service) ----
export {
  createApplicationPasswordService,
  type ApplicationPasswordService,
  type ApplicationPasswordSummary,
  type CreatedApplicationPassword,
} from './auth/app-passwords.js';

// ---- Transactional mail (SMTP or in-memory sink) ----
export {
  createMailService,
  createMemoryMailTransport,
  createSmtpMailTransport,
  type CommentMailInput,
  type CommentNotificationInput,
  type MailMessage,
  type MailResult,
  type MailService,
  type MailStatus,
  type MailTransport,
  type NewUserMailInput,
  type PasswordResetMailInput,
  type SentMail,
  type SmtpTransportOptions,
} from './mail/service.js';
