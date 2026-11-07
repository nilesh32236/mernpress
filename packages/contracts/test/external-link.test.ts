import { describe, expect, it } from 'vitest';
import { checkExternalUrl, isPublicResolution } from '../src/external-link.js';

describe('SSRF guard for external link checks', () => {
  it('allows ordinary https URLs on default ports', () => {
    expect(checkExternalUrl('https://example.com/page?a=1')).toEqual({
      allowed: true,
      reason: 'ok',
    });
    expect(checkExternalUrl('http://example.com:80/')).toEqual({ allowed: true, reason: 'ok' });
    expect(checkExternalUrl('https://8.8.8.8/dns')).toEqual({ allowed: true, reason: 'ok' });
  });

  it('rejects non-http schemes, credentials and non-default ports', () => {
    expect(checkExternalUrl('ftp://example.com/file')).toMatchObject({
      allowed: false,
      reason: 'scheme',
    });
    expect(checkExternalUrl('file:///etc/passwd')).toMatchObject({
      allowed: false,
      reason: 'scheme',
    });
    expect(checkExternalUrl('https://user:pass@example.com/')).toMatchObject({
      allowed: false,
      reason: 'credentials',
    });
    expect(checkExternalUrl('https://example.com:8443/')).toMatchObject({
      allowed: false,
      reason: 'port',
    });
    expect(checkExternalUrl('http://example.com:8080/')).toMatchObject({
      allowed: false,
      reason: 'port',
    });
  });

  it('rejects localhost and private IP literals', () => {
    const blocked = [
      'http://localhost/admin',
      'http://localhost:80/',
      'http://127.0.0.1/',
      'http://10.0.0.5/',
      'http://172.16.0.9/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/',
      'http://[fe80::1]/',
      'http://internal.corp.local/',
    ];
    for (const url of blocked) {
      expect(checkExternalUrl(url), url).toMatchObject({ allowed: false, reason: 'host' });
    }
  });

  it('requires every DNS answer to be public (rebinding guard)', () => {
    expect(isPublicResolution(['93.184.216.34'])).toBe(true);
    expect(isPublicResolution(['93.184.216.34', '10.0.0.1'])).toBe(false);
    expect(isPublicResolution([])).toBe(false);
    expect(isPublicResolution(['::1'])).toBe(false);
  });
});
