export type AuthErrorCode =
  | 'ADMIN_ALREADY_EXISTS'
  | 'USERNAME_TAKEN'
  | 'WEAK_PASSWORD'
  | 'INVALID_USERNAME'
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

export type UserRole = 'administrator';
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
  username: string;
  password: string;
  ip: string;
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

export interface AuthService {
  bootstrapAdmin(input: BootstrapInput): Promise<PublicUser>;
  login(input: LoginInput): Promise<LoginResult>;
  validateSession(sessionToken: string): Promise<SessionValidation | null>;
  logout(sessionToken: string): Promise<void>;
}
