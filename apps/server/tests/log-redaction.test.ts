import { describe, expect, it } from 'vitest';
import { redactUrl } from '../src/log-redaction.ts';

describe('redactUrl', () => {
  it('keeps a plain path', () => {
    expect(redactUrl('/api/v1/workspaces/abc/projects')).toBe('/api/v1/workspaces/abc/projects');
  });

  it('drops the query string, where verification tokens and OAuth codes travel', () => {
    expect(redactUrl('/api/v1/auth/verify-email?token=eyJhbGciOi&callbackURL=/')).toBe(
      '/api/v1/auth/verify-email?[Redacted]',
    );
    expect(redactUrl('/api/v1/auth/callback/github?code=abc&state=xyz')).toBe(
      '/api/v1/auth/callback/github?[Redacted]',
    );
  });

  it('hides the password reset token in the path', () => {
    expect(redactUrl('/api/v1/auth/reset-password/s3cr3tT0ken?callbackURL=/x')).toBe(
      '/api/v1/auth/reset-password/[Redacted]?[Redacted]',
    );
  });
});
