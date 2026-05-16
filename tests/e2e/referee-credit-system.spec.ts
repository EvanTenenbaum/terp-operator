import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { CommandName } from '../../src/shared/commandCatalog';

async function login(page: Page, email = 'owner@terpagro.local') {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(/Daily Decision View/).waitFor();
}

async function trpcQuery(page: Page, path: string, inputValue: unknown = null) {
  return page.evaluate(async ({ queryPath, queryInput }) => {
    const input = encodeURIComponent(JSON.stringify({ 0: { json: queryInput } }));
    const response = await fetch(`/trpc/${queryPath}?batch=1&input=${input}`, { credentials: 'include' });
    return response.json();
  }, { queryPath: path, queryInput: inputValue });
}

function queryData<T = unknown>(response: unknown): T {
  return (response as { 0: { result: { data: { json: T } } } })[0].result.data.json;
}

async function runCommand(page: Page, name: CommandName, payload: Record<string, unknown>, reason = 'referee system e2e') {
  return page.evaluate(
    async ({ commandName, commandPayload, commandReason }) => {
      const body = {
        0: {
          json: {
            name: commandName,
            payload: commandPayload,
            reason: commandReason,
            idempotencyKey: `${commandName}-${crypto.randomUUID()}`
          }
        }
      };
      const response = await fetch('/trpc/commands.run?batch=1', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      return response.json();
    },
    { commandName: name, commandPayload: payload, commandReason: reason }
  );
}

function commandData(response: unknown) {
  return (response as { 0: { result: { data: { json: { ok: boolean; commandId: string; affectedIds: string[]; toast?: string } } } } })[0].result.data.json;
}

test('referee credit system: create referee and relationship', async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);

  // Get reference data
  const reference = queryData<{
    customers: Array<{ id: string; name: string }>;
    referees: Array<{ id: string; name: string; balance: string; lifetimeEarned: string }>;
    refereeRelationships: Array<{ id: string; refereeId: string; entityType: string; entityId: string }>;
  }>(await trpcQuery(page, 'queries.reference'));

  const customer = reference.customers[0];
  expect(customer, 'seed customer must exist').toBeTruthy();

  const initialRefereeCount = reference.referees.length;

  // 1. Create referee
  console.log('Creating referee...');
  const createRefereeResult = commandData(await runCommand(page, 'createReferee', {
    name: 'Test Referee E2E',
    email: 'referee.e2e@test.com',
    paymentMethod: 'check'
  }));
  expect(createRefereeResult.ok).toBe(true);
  expect(createRefereeResult.toast).toContain('Test Referee');
  const refereeId = createRefereeResult.affectedIds[0];
  console.log('Created referee:', refereeId);

  // Verify referee appears in reference data
  const updatedRef = queryData<{
    referees: Array<{ id: string; name: string; email: string | null; balance: string; lifetimeEarned: string; active: boolean }>;
  }>(await trpcQuery(page, 'queries.reference'));

  expect(updatedRef.referees.length).toBe(initialRefereeCount + 1);
  const newReferee = updatedRef.referees.find((r) => r.id === refereeId);
  expect(newReferee).toBeTruthy();
  expect(newReferee!.name).toBe('Test Referee E2E');
  expect(newReferee!.email).toBe('referee.e2e@test.com');
  expect(Number(newReferee!.balance)).toBe(0);
  expect(Number(newReferee!.lifetimeEarned)).toBe(0);

  // 2. Add referee relationship (5% fee on customer purchases)
  console.log('Adding referee relationship...');
  const addRelationshipResult = commandData(await runCommand(page, 'addRefereeRelationship', {
    refereeId,
    entityType: 'customer',
    entityId: customer.id,
    feeType: 'percentage',
    feePercentage: 5.0,
    applyByDefault: true
  }));
  expect(addRelationshipResult.ok).toBe(true);
  const relationshipId = addRelationshipResult.affectedIds[0];
  console.log('Created relationship:', relationshipId);

  // Verify relationship appears in reference data
  const refWithRelationship = queryData<{
    refereeRelationships: Array<{
      id: string;
      refereeId: string;
      refereeName: string;
      entityType: string;
      entityId: string;
      entityName: string;
      feeType: string;
      feePercentage: string | null;
      feeFixedAmount: string | null;
      applyByDefault: boolean;
      active: boolean;
    }>;
  }>(await trpcQuery(page, 'queries.reference'));

  const newRelationship = refWithRelationship.refereeRelationships.find((r) => r.id === relationshipId);
  expect(newRelationship).toBeTruthy();
  expect(newRelationship!.refereeId).toBe(refereeId);
  expect(newRelationship!.entityType).toBe('customer');
  expect(newRelationship!.entityId).toBe(customer.id);
  expect(newRelationship!.feeType).toBe('percentage');
  expect(Number(newRelationship!.feePercentage)).toBe(5.0);
  expect(newRelationship!.applyByDefault).toBe(true);

  console.log('✅ Referee and relationship creation test passed');
});

test('referee commands are registered in catalog', async ({ page }) => {
  test.setTimeout(60_000);
  await login(page);

  const reference = queryData<{
    commands: Array<{ name: string; label: string; minRole: string }>;
  }>(await trpcQuery(page, 'queries.reference'));

  const refereeCommands = reference.commands.filter((cmd) => cmd.name.includes('eferee'));

  console.log('Found referee commands:', refereeCommands.map((c) => c.name).join(', '));

  expect(refereeCommands.length).toBeGreaterThanOrEqual(6);

  const commandNames = refereeCommands.map((c) => c.name);
  expect(commandNames).toContain('createReferee');
  expect(commandNames).toContain('updateReferee');
  expect(commandNames).toContain('addRefereeRelationship');
  expect(commandNames).toContain('updateRefereeRelationship');
  expect(commandNames).toContain('deactivateRefereeRelationship');
  expect(commandNames).toContain('voidRefereeCredit');

  // All referee commands should require manager role
  for (const cmd of refereeCommands) {
    expect(cmd.minRole).toBe('manager');
  }

  console.log('✅ Referee commands catalog test passed');
});
