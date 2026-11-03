export type AuthErrorCode =
  | 'ADMIN_ALREADY_EXISTS'
  | 'USERNAME_TAKEN'
  | 'WEAK_PASSWORD'
  | 'INVALID_USERNAME'
  | 'INVALID_ROLE'
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'UNAUTHENTICATED';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly statusCode: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: AuthErrorCode,
    message: string,
    statusCode: number,
    options: { retryAfterSeconds?: number; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
    if (options.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }
}

export type UserRole = 'administrator' | 'editor' | 'author' | 'contributor' | 'subscriber';
export type UserStatus = 'active' | 'disabled';

export interface PublicUser {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
}

export interface AuthConfig {
  hashPepper: string;
  sessionTtlMinutes: number;
  sessionIdleMinutes: number;
  loginRateLimitMax: number;
  loginRateLimitWindowMinutes: number;
  now?: () => Date;
}

export interface LoginInput {
  /** Username or email address, like WordPress. */
  username: string;
  password: string;
  ip: string;
  /** Extends the session to the long-lived "Remember Me" window. */
  remember?: boolean | undefined;
}

export interface LoginResult {
  user: PublicUser;
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
}

export interface SessionValidation {
  user: PublicUser;
  sessionId: string;
  csrfHash: string;
  expiresAt: Date;
}

export interface BootstrapInput {
  username: string;
  password: string;
}

/** Roles creatable via the development-only manual-test account CLI (ADR 0004).
 * Administrator is deliberately excluded — the first admin is bootstrap-only. */
export type ManualTestRole = 'editor' | 'author' | 'contributor' | 'subscriber';

export interface ManualTestAccountInput {
  username: string;
  password: string;
  role: ManualTestRole;
}

export interface AuthService {
  bootstrapAdmin(input: BootstrapInput): Promise<PublicUser>;
  createManualTestAccount(input: ManualTestAccountInput): Promise<PublicUser>;
  login(input: LoginInput): Promise<LoginResult>;
  validateSession(sessionToken: string): Promise<SessionValidation | null>;
  logout(sessionToken: string): Promise<void>;
}
