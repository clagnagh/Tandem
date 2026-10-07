// Outgoing email goes through this interface so tests can capture messages
// in memory and production can send them for real.

export interface Email {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send: (email: Email) => Promise<void>;
}
