import { it } from 'vitest';

/**
 * A test for behaviour that is not built yet. The spec says to commit
 * failing tests before the code (section 3, "Tests first").
 *
 * It runs as `it.fails`, so CI stays green while the test fails. As soon as
 * the behaviour works the test passes, `it.fails` reports that as a failure,
 * and CI goes red until you change `pendingIt` to `it`. Each description
 * names the step expected to make it pass, e.g. "[step 4] ...".
 *
 * `it.fails` cannot tell a right failure from a wrong one (a typo in the test
 * fails too). Run `SHOW_PENDING=1 pnpm test:integration` to run these as
 * normal tests and read the real reasons they fail.
 */
export const pendingIt = process.env.SHOW_PENDING ? it : it.fails;
