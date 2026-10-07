import { createTransport } from 'nodemailer';
import type { Mailer } from './mailer.ts';

/** Sends email over SMTP. Locally that is Mailpit (docker compose, port 1025). */
export function createSmtpMailer(options: { host: string; port: number; from: string }): Mailer {
  const transport = createTransport({ host: options.host, port: options.port, secure: false });
  return {
    send: async (email) => {
      await transport.sendMail({ from: options.from, ...email });
    },
  };
}
