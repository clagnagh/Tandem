// The Phase 1 main flow in a real browser:
//  - "A new user can sign up, verify their email through the mail catcher,
//    log in and log out."
//  - "Tasks can be ... moved between columns and reordered by drag and drop;
//    order survives a reload."
import { expect, test, type Locator, type Page } from '@playwright/test';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';

interface MailpitSearch {
  messages: { ID: string }[];
}

/** The first link in the newest email to `to`, read from Mailpit's API. */
async function latestLinkTo(to: string): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        );
        const body = (await res.json()) as MailpitSearch;
        id = body.messages[0]?.ID;
        return id;
      },
      { message: `waiting for an email to ${to}` },
    )
    .toBeTruthy();
  const res = await fetch(`${MAILPIT}/api/v1/message/${id ?? ''}`);
  const message = (await res.json()) as { Text: string };
  const link = /https?:\/\/\S+/.exec(message.Text)?.[0];
  if (!link) throw new Error('No link in the email');
  return link;
}

/** Drags with the mouse in small steps, the way dnd-kit's pointer sensor expects. */
async function drag(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('drag source or target is not visible');
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y + 10, { steps: 5 }); // past the 5 px activation distance
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(to.height / 2, 40), { steps: 20 });
  await page.mouse.up();
}

/**
 * Drags, then waits for the move to be saved. If the drop did not register,
 * no request is sent: fail within seconds with a clear message rather than
 * waiting out the whole test timeout.
 */
async function dragAndWaitForSave(page: Page, source: Locator, target: Locator) {
  const saved = page.waitForResponse((r) => r.url().includes('/move') && r.ok(), {
    timeout: 10_000,
  });
  await drag(page, source, target);
  await saved.catch(() => {
    throw new Error('The drop did not send a move request (see the trace).');
  });
}

function card(page: Page, column: string, title: string) {
  return page.getByTestId(`column-${column}`).getByTestId('task-card').filter({ hasText: title });
}

async function titlesIn(page: Page, column: string): Promise<string[]> {
  const titles = page
    .getByTestId(`column-${column}`)
    .getByTestId('task-card')
    .locator('span.font-medium');
  return titles.allTextContents();
}

test('sign up, verify, build a board, drag tasks, reload, sign out', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'e2e-password-correct-horse';

  // Sign up, then verify through the mail catcher.
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('E2E User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  await page.goto(await latestLinkTo(email));
  await expect(page.getByText('Email verified')).toBeVisible();

  // Sign in.
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your workspaces' })).toBeVisible();

  // A workspace, a project and three tasks.
  await page.getByLabel('New workspace').fill('E2E Workspace');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: /E2E Workspace/ }).click();
  await page.getByLabel('New project').fill('Launch');
  await page.getByRole('button', { name: 'Create' }).first().click();
  await page.getByRole('link', { name: 'Launch' }).click();

  for (const title of ['Write copy', 'Design logo', 'Ship it']) {
    await page.getByLabel('New task in To do').fill(title);
    await page.getByLabel('New task in To do').press('Enter');
    await expect(card(page, 'todo', title)).toBeVisible();
  }

  // Drag "Write copy" into the empty Done column.
  await dragAndWaitForSave(page, card(page, 'todo', 'Write copy'), page.getByTestId('column-done'));
  await expect(card(page, 'done', 'Write copy')).toBeVisible();

  // Drag "Ship it" onto "Write copy": it takes the top of Done.
  await dragAndWaitForSave(page, card(page, 'todo', 'Ship it'), card(page, 'done', 'Write copy'));
  expect(await titlesIn(page, 'done')).toEqual(['Ship it', 'Write copy']);

  // The order comes back from the server after a reload.
  await page.reload();
  await expect(card(page, 'done', 'Write copy')).toBeVisible();
  expect(await titlesIn(page, 'todo')).toEqual(['Design logo']);
  expect(await titlesIn(page, 'done')).toEqual(['Ship it', 'Write copy']);

  // Sign out: the board is no longer reachable.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.goto('/workspaces');
  await expect(page).toHaveURL(/\/sign-in\?next=/);
});
