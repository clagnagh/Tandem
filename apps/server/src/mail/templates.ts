// Email bodies. User-supplied text (names) is escaped before it goes into
// HTML, so a name like "<img src=x onerror=...>" stays plain text.
import type { Email } from './mailer.ts';

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function linkEmail(options: {
  to: string;
  name: string;
  subject: string;
  intro: string;
  action: string;
  url: string;
  outro: string;
}): Email {
  const { to, name, subject, intro, action, url, outro } = options;
  return {
    to,
    subject,
    text: `Hi ${name},\n\n${intro}\n\n${url}\n\n${outro}\n`,
    html: [
      `<p>Hi ${escapeHtml(name)},</p>`,
      `<p>${escapeHtml(intro)}</p>`,
      `<p><a href="${escapeHtml(url)}">${escapeHtml(action)}</a></p>`,
      `<p>${escapeHtml(outro)}</p>`,
    ].join('\n'),
  };
}

export function verificationEmail(user: { email: string; name: string }, url: string): Email {
  return linkEmail({
    to: user.email,
    name: user.name,
    subject: 'Verify your email for Tandem',
    intro: 'Confirm this is your email address to finish creating your Tandem account.',
    action: 'Verify email',
    url,
    outro: "If you didn't sign up for Tandem, you can ignore this email.",
  });
}

export function passwordResetEmail(user: { email: string; name: string }, url: string): Email {
  return linkEmail({
    to: user.email,
    name: user.name,
    subject: 'Reset your Tandem password',
    intro:
      'Someone asked to reset the password for your Tandem account. The link works once and expires in an hour.',
    action: 'Choose a new password',
    url,
    outro: "If that wasn't you, ignore this email: your password stays the same.",
  });
}
