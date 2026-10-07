import type { Email, Mailer } from '../../src/mail/mailer.ts';

export interface MemoryMailer extends Mailer {
  sent: Email[];
  /** The most recent email to this address. Throws if there is none. */
  latestTo: (to: string) => Email;
}

export function createMemoryMailer(): MemoryMailer {
  const sent: Email[] = [];
  return {
    sent,
    send: (email) => {
      sent.push(email);
      return Promise.resolve();
    },
    latestTo: (to) => {
      const email = sent.findLast((e) => e.to === to);
      if (!email) throw new Error(`No email was sent to ${to}`);
      return email;
    },
  };
}

/** The first http(s) link in an email's text. */
export function linkIn(email: Email): URL {
  const match = /https?:\/\/[^\s"'<>]+/.exec(email.text);
  if (!match) throw new Error(`No link in email "${email.subject}"`);
  return new URL(match[0]);
}

/** A token from a link: the `token` query parameter, else the last path segment. */
export function tokenIn(link: URL): string {
  const token = link.searchParams.get('token') ?? link.pathname.split('/').at(-1);
  if (!token) throw new Error(`No token in ${link.href}`);
  return token;
}
