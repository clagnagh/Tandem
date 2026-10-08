import { describe, expect, it } from 'vitest';
import { passwordResetEmail, verificationEmail } from '../src/mail/templates.ts';

const url = 'http://localhost:3000/api/v1/auth/verify-email?token=abc&callbackURL=/';

describe('email templates', () => {
  it('escape user-supplied names in HTML', () => {
    const email = verificationEmail(
      { email: 'x@example.com', name: '<img src=x onerror=alert(1)>' },
      url,
    );
    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('put the link in both the text and the HTML version', () => {
    const email = passwordResetEmail({ email: 'x@example.com', name: 'Dana' }, url);
    expect(email.to).toBe('x@example.com');
    expect(email.text).toContain(url);
    expect(email.html).toContain(url.replaceAll('&', '&amp;'));
  });
});
