// Phase 1 auth acceptance criteria, written before the auth code (step 3).
// Step 4 integrated Better Auth and made them pass.
//
//  - sign up, verify email, log in, log out
//  - login rate limited to 5 attempts per minute per IP and per email (Redis)
//  - session cookies are HttpOnly, Secure, SameSite=Lax
//  - passwords never appear in logs
//  - login and password reset do not reveal whether an email has an account
//  - cross-origin state-changing requests are rejected (docs/adr/0004)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TEST_APP_URL, TEST_GITHUB, type TestApp } from './support/app.ts';
import {
  AUTH,
  cookiesFrom,
  createVerifiedUser,
  newUser,
  pathOf,
  postOverSocket,
  send,
  signIn,
  signUp,
  uniqueIp,
  verifyEmail,
} from './support/http.ts';
import { linkIn, tokenIn } from './support/mailer.ts';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.close();
});

const nextIp = uniqueIp;

describe('sign-up, verification, sign-in and sign-out', () => {
  it('[step 4] signs up, verifies the email, signs in and signs out', async () => {
    const user = newUser('Dana');

    const signUpRes = await signUp(t.app, user);
    expect(signUpRes.statusCode).toBe(200);
    expect(t.outbox.latestTo(user.email).subject).toMatch(/verify/i);

    const verifyRes = await verifyEmail(t.app, t.outbox, user.email);
    expect(verifyRes.statusCode).toBeLessThan(400);

    const signInRes = await signIn(t.app, user, { ip: nextIp() });
    expect(signInRes.statusCode).toBe(200);
    const cookie = cookiesFrom(signInRes);

    const session = await send(t.app, 'GET', `${AUTH}/get-session`, { cookie });
    expect(session.json()).toMatchObject({ user: { email: user.email } });

    const signOutRes = await send(t.app, 'POST', `${AUTH}/sign-out`, { cookie });
    expect(signOutRes.statusCode).toBe(200);
    const after = await send(t.app, 'GET', `${AUTH}/get-session`, { cookie });
    expect(after.json()).toBeNull();
  });

  it('[step 4] refuses to sign in until the email is verified', async () => {
    const user = newUser('Unverified');
    expect((await signUp(t.app, user)).statusCode).toBe(200);

    const res = await signIn(t.app, user, { ip: nextIp() });
    expect(res.statusCode).toBe(403);
    expect(cookiesFrom(res)).not.toMatch(/session_token/);
  });

  it('[step 4] sets the session cookie HttpOnly, Secure and SameSite=Lax', async () => {
    const user = await createVerifiedUser(t.app, t.outbox, 'Cookie Monster');
    const res = await signIn(t.app, user, { ip: nextIp() });

    const session = res.cookies.find((c) => c.name.includes('session_token'));
    expect(session).toBeDefined();
    expect(session?.httpOnly).toBe(true);
    expect(session?.secure).toBe(true);
    expect(session?.sameSite?.toLowerCase()).toBe('lax');
  });
});

describe('session token stays out of reach of JavaScript', () => {
  it('is not in the sign-in or get-session response bodies', async () => {
    const user = newUser('Private');
    expect((await signUp(t.app, user)).statusCode).toBe(200);
    expect((await verifyEmail(t.app, t.outbox, user.email)).statusCode).toBeLessThan(400);

    const signInRes = await signIn(t.app, user, { ip: nextIp() });
    expect(signInRes.statusCode).toBe(200);
    const cookieValue = signInRes.cookies.find((c) => c.name.includes('session_token'))?.value;
    // The cookie holds "<token>.<signature>".
    const token = decodeURIComponent(cookieValue ?? '').split('.')[0] ?? '';
    expect(token.length).toBeGreaterThan(10);

    const session = await send(t.app, 'GET', `${AUTH}/get-session`, {
      cookie: cookiesFrom(signInRes),
    });
    expect(session.json()).toMatchObject({ user: { email: user.email } });
    expect(signInRes.body).not.toContain(token);
    expect(session.body).not.toContain(token);
  });
});

describe('not revealing which emails have accounts', () => {
  it('[step 4] answers a wrong password and an unknown email identically', async () => {
    const user = await createVerifiedUser(t.app, t.outbox, 'Known');

    const wrongPassword = await signIn(
      t.app,
      { email: user.email, password: 'not-the-password-123' },
      { ip: nextIp() },
    );
    const unknownEmail = await signIn(
      t.app,
      { email: 'nobody-here@example.com', password: 'not-the-password-123' },
      { ip: nextIp() },
    );

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(wrongPassword.statusCode);
    expect(unknownEmail.json()).toEqual(wrongPassword.json());
  });
});

describe('password reset', () => {
  const requestReset = (email: string) =>
    send(t.app, 'POST', `${AUTH}/request-password-reset`, {
      body: { email, redirectTo: `${TEST_APP_URL}/reset-password` },
    });

  it('[step 4] answers the same whether or not the email has an account', async () => {
    const user = await createVerifiedUser(t.app, t.outbox, 'Forgetful');
    const sentBefore = t.outbox.sent.length;

    const known = await requestReset(user.email);
    const unknown = await requestReset('nobody-at-all@example.com');

    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(known.statusCode);
    expect(unknown.json()).toEqual(known.json());
    // Only the real account gets an email.
    expect(t.outbox.sent.slice(sentBefore).map((e) => e.to)).toEqual([user.email]);
  });

  it('[step 4] resets the password with a single-use link and signs out old sessions', async () => {
    const user = await createVerifiedUser(t.app, t.outbox, 'Resetter');
    expect((await requestReset(user.email)).statusCode).toBe(200);
    const token = tokenIn(linkIn(t.outbox.latestTo(user.email)));
    const newPassword = 'a-brand-new-password-456';

    const reset = await send(t.app, 'POST', `${AUTH}/reset-password`, {
      body: { token, newPassword },
    });
    expect(reset.statusCode).toBe(200);

    const reused = await send(t.app, 'POST', `${AUTH}/reset-password`, {
      body: { token, newPassword: 'yet-another-password-789' },
    });
    expect(reused.statusCode).toBe(400);

    expect((await signIn(t.app, user, { ip: nextIp() })).statusCode).toBe(401);
    expect(
      (await signIn(t.app, { email: user.email, password: newPassword }, { ip: nextIp() }))
        .statusCode,
    ).toBe(200);

    // The session from before the reset no longer works.
    const old = await send(t.app, 'GET', `${AUTH}/get-session`, { cookie: user.cookie });
    expect(old.json()).toBeNull();
  });
});

describe('login rate limit: 5 attempts per minute per IP and per email', () => {
  const wrong = 'definitely-wrong-password';

  it('[step 4] blocks the 6th attempt on one email, even from different IPs', async () => {
    // Signed up and verified but never signed in, so no attempts are used yet.
    const user = newUser('Targeted');
    expect((await signUp(t.app, user)).statusCode).toBe(200);
    expect((await verifyEmail(t.app, t.outbox, user.email)).statusCode).toBeLessThan(400);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await signIn(t.app, { email: user.email, password: wrong }, { ip: nextIp() });
      expect(res.statusCode, `attempt ${attempt}`).toBe(401);
    }
    // The 6th attempt is refused even with the right password.
    const sixth = await signIn(t.app, user, { ip: nextIp() });
    expect(sixth.statusCode).toBe(429);
    const retryAfter = Number(sixth.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('[step 4] blocks the 6th attempt from one IP, even across emails', async () => {
    const ip = nextIp();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await signIn(
        t.app,
        { email: `spray-${attempt}@example.com`, password: wrong },
        { ip },
      );
      expect(res.statusCode, `attempt ${attempt}`).toBe(401);
    }
    const sixth = await signIn(t.app, { email: 'spray-6@example.com', password: wrong }, { ip });
    expect(sixth.statusCode).toBe(429);
  });

  it('counts attempts on every path that reaches sign-in, like /./sign-in/email', async () => {
    // URL parsing turns "/auth/./sign-in/email" and "/auth/x/../sign-in/email"
    // into the sign-in path, so the limiter must count them too. This goes
    // over a real socket because app.inject() would tidy the paths first.
    await t.app.listen({ port: 0, host: '127.0.0.1' });
    const ip = nextIp();
    const variants = [
      `${AUTH}/./sign-in/email`,
      `${AUTH}/x/../sign-in/email`,
      `${AUTH}/sign-in/./email`,
      `${AUTH}/sign-in/email?probe=1`,
      `${AUTH}/./sign-in/email`,
      `${AUTH}/./sign-in/email`,
    ];
    const statuses: number[] = [];
    for (const [i, path] of variants.entries()) {
      statuses.push(
        await postOverSocket(
          t.app,
          path,
          { email: `variant-${i}@example.com`, password: wrong },
          { ip },
        ),
      );
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it('[step 4] ignores X-Forwarded-For unless the request comes through the web app', async () => {
    // A client connecting directly cannot dodge the IP limit by faking the
    // header: only the Next.js proxy on 127.0.0.1 is trusted to set it.
    const remoteAddress = '203.0.113.50';
    const statuses: number[] = [];
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const res = await signIn(
        t.app,
        { email: `dodger-${attempt}@example.com`, password: wrong },
        { remoteAddress, ip: nextIp() },
      );
      statuses.push(res.statusCode);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });
});

describe('CSRF (docs/adr/0004)', () => {
  it('[step 4] rejects sign-in from another origin or with no Origin', async () => {
    const user = await createVerifiedUser(t.app, t.outbox, 'Victim');

    const foreign = await signIn(t.app, user, { ip: nextIp(), origin: 'https://evil.example' });
    expect(foreign.statusCode).toBe(403);
    expect(cookiesFrom(foreign)).not.toMatch(/session_token/);

    const missing = await signIn(t.app, user, { ip: nextIp(), origin: null });
    expect(missing.statusCode).toBe(403);
  });
});

describe('GitHub OAuth', () => {
  it('[step 4] starts sign-in by redirecting to GitHub with state', async () => {
    const res = await send(t.app, 'POST', `${AUTH}/sign-in/social`, {
      body: { provider: 'github', callbackURL: '/' },
    });
    expect(res.statusCode).toBe(200);

    const url = new URL(res.json<{ url: string }>().url);
    expect(url.origin).toBe('https://github.com');
    expect(url.pathname).toBe('/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe(TEST_GITHUB.clientId);
    expect(url.searchParams.get('state')).toBeTruthy();
    // GitHub sends the user back through the web app's origin (docs/adr/0002).
    expect(url.searchParams.get('redirect_uri')).toBe(`${TEST_APP_URL}${AUTH}/callback/github`);
  });
});

describe('logs', () => {
  it('[step 4] never contain passwords or tokens', async () => {
    const user = newUser('Canary');
    const canary = `canary-${user.password}`;
    const withCanary = { ...user, password: canary };

    expect((await signUp(t.app, withCanary)).statusCode).toBe(200);
    const token = tokenIn(linkIn(t.outbox.latestTo(user.email)));
    await send(t.app, 'GET', pathOf(linkIn(t.outbox.latestTo(user.email))));
    const signInRes = await signIn(t.app, withCanary, { ip: nextIp() });
    expect(signInRes.statusCode).toBe(200);
    await signIn(t.app, { email: user.email, password: `${canary}-wrong` }, { ip: nextIp() });

    const logs = t.log.text();
    expect(logs).toContain('request completed'); // the requests were logged at all
    expect(logs).not.toContain(canary);
    expect(logs).not.toContain(token);
  });
});

describe('when Redis is down', () => {
  it('refuses sign-in (503) rather than skip the rate limit', async () => {
    // Port 1 on loopback: nothing listens there, so every connection fails.
    const down = await createTestApp({ redisUrl: 'redis://127.0.0.1:1' });
    try {
      const res = await signIn(
        down.app,
        { email: 'anyone@example.com', password: 'whatever-password' },
        { ip: nextIp() },
      );
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ error: { code: 'unavailable' } });
    } finally {
      await down.close();
    }
  });
});
