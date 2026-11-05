import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

const validEnv = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '4000',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://mernpress:secret@127.0.0.1:5432/mernpress_test',
  CORS_ORIGINS: 'http://localhost:5173',
};

describe('loadEnv', () => {
  it('parses and normalizes a valid environment', () => {
    const env = loadEnv(validEnv);

    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173']);
  });

  it('fails with an actionable message when DATABASE_URL is missing', () => {
    expect(() => loadEnv({ ...validEnv, DATABASE_URL: '' })).toThrow(/DATABASE_URL is required/);
  });

  it('fails when DATABASE_URL is not a PostgreSQL URL', () => {
    expect(() =>
      loadEnv({ ...validEnv, DATABASE_URL: 'https://example.com/not-a-database' }),
    ).toThrow(/DATABASE_URL must be a valid postgresql:\/\//);
  });

  it('rejects wildcard CORS origins', () => {
    expect(() => loadEnv({ ...validEnv, CORS_ORIGINS: '*' })).toThrow(/wildcard/);
  });

  it('rejects an invalid port', () => {
    expect(() => loadEnv({ ...validEnv, PORT: '70000' })).toThrow(/PORT/);
  });

  it('requires NODE_ENV explicitly', () => {
    const { NODE_ENV: _nodeEnv, ...withoutNodeEnv } = validEnv;
    expect(() => loadEnv(withoutNodeEnv)).toThrow(/NODE_ENV/);
  });

  it('requires explicit production CORS and HTTPS non-loopback origins', () => {
    const { CORS_ORIGINS: _corsOrigins, ...withoutCors } = validEnv;
    expect(() => loadEnv({ ...withoutCors, NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS/);

    expect(() =>
      loadEnv({
        ...validEnv,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'http://localhost:5173',
        AUTH_HASH_PEPPER: 'a'.repeat(40),
      }),
    ).toThrow(/HTTPS|loopback/);

    expect(() =>
      loadEnv({
        ...validEnv,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://admin.example.com',
        AUTH_HASH_PEPPER: 'change-me-change-me-change-me-change-me',
      }),
    ).toThrow(/AUTH_HASH_PEPPER/);
  });

  it('accepts a complete production configuration', () => {
    const env = loadEnv({
      ...validEnv,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://admin.example.com',
      AUTH_HASH_PEPPER: 'a-real-production-pepper-with-enough-length',
      PLUGIN_STORAGE_DIR: '/opt/mernpress/plugins',
      THEME_STORAGE_DIR: '/opt/mernpress/themes',
    });

    expect(env.CORS_ORIGINS).toEqual(['https://admin.example.com']);
    expect(env.AUTH_HASH_PEPPER).toBe('a-real-production-pepper-with-enough-length');
    expect(env.PLUGIN_STORAGE_DIR).toBe('/opt/mernpress/plugins');
    expect(env.THEME_STORAGE_DIR).toBe('/opt/mernpress/themes');

    expect(() =>
      loadEnv({
        ...validEnv,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://admin.example.com',
        AUTH_HASH_PEPPER: 'a-real-production-pepper-with-enough-length',
      }),
    ).toThrow(/PLUGIN_STORAGE_DIR/);

    expect(() =>
      loadEnv({
        ...validEnv,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://admin.example.com',
        AUTH_HASH_PEPPER: 'a-real-production-pepper-with-enough-length',
        PLUGIN_STORAGE_DIR: '/opt/mernpress/plugins',
      }),
    ).toThrow(/THEME_STORAGE_DIR/);
  });

  it('rejects CORS origins with paths and idle timeouts longer than absolute TTL', () => {
    expect(() => loadEnv({ ...validEnv, CORS_ORIGINS: 'https://admin.example.com/evil' })).toThrow(
      /origin/,
    );
    expect(() =>
      loadEnv({ ...validEnv, SESSION_TTL_MINUTES: '10', SESSION_IDLE_MINUTES: '20' }),
    ).toThrow(/SESSION_IDLE_MINUTES/);
  });
});
