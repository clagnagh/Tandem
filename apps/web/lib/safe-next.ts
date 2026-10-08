/**
 * Where to go after signing in. Only a path on this site is allowed: an
 * absolute URL, "//evil.example" or "/\evil.example" in ?next= would make
 * the sign-in page an open redirect that phishing links could use.
 */
export function safeNext(next: string | null): string {
  if (next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')) return next;
  return '/workspaces';
}
