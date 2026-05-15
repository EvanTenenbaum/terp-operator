import { expect, test, type Page } from '@playwright/test';
import type { CommandName } from '../../src/shared/commandCatalog';

async function login(page: Page) {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Owner Daily Decision View').waitFor();
}

async function runCommand(page: Page, name: CommandName, payload: Record<string, unknown>, reason: string) {
  return page.evaluate(
    async ({ commandName, commandPayload, commandReason }) => {
      const response = await fetch('/trpc/commands.run?batch=1', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          0: {
            json: {
              name: commandName,
              payload: commandPayload,
              reason: commandReason,
              idempotencyKey: `${commandName}-${crypto.randomUUID()}`
            }
          }
        })
      });
      return response.json();
    },
    { commandName: name, commandPayload: payload, commandReason: reason }
  );
}

function commandData(response: unknown) {
  return (response as Array<{ result?: { data?: { json?: unknown } } }>)[0]?.result?.data?.json as
    | { ok: boolean; toast?: string }
    | undefined;
}

test.describe('lockPeriod concurrency', () => {
  test('advisory lock serializes concurrent lockPeriod attempts for the same safe period', async ({ page }) => {
    test.setTimeout(60_000);
    await login(page);
    // Pick a historical period that has zero work in the seeded DB so it can lock cleanly.
    const period = '2019-01';
    const [first, second] = await Promise.all([
      runCommand(page, 'lockPeriod', { period }, 'concurrency probe A'),
      runCommand(page, 'lockPeriod', { period }, 'concurrency probe B')
    ]);
    const a = commandData(first);
    const b = commandData(second);
    // Both attempts must return ok — the advisory lock serializes them so the
    // second sees the row inserted by the first and returns "already locked".
    expect(a?.ok).toBe(true);
    expect(b?.ok).toBe(true);
    const toasts = [a?.toast ?? '', b?.toast ?? ''];
    expect(toasts.some((t) => /locked\.$/.test(t))).toBe(true);
    expect(toasts.some((t) => /already locked/.test(t))).toBe(true);
  });
});
