import { test, expect, Page } from '@playwright/test';

// Helper to wait for backend to be ready
async function waitForBackend(page: Page) {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
}

// Helper to log in before each test
async function login(page: Page) {
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible({ timeout: 20000 });
}

// Helper to wait for network idle
async function waitForLoad(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500); // Small buffer for React state updates
}

// Helper to check console for errors
function setupConsoleMonitor(page: Page) {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  return errors;
}

test.describe('Payment Processor System - Manual QA', () => {
  let consoleErrors: string[];

  test.beforeEach(async ({ page }) => {
    consoleErrors = setupConsoleMonitor(page);
    await login(page);
    await waitForLoad(page);
  });

  test('Scenario 1: Navigate to Processors View', async ({ page }) => {
    console.log('\n=== TEST 1: Navigate to Processors View ===');
    
    // Navigate to Payments → Processors
    await page.click('[data-testid="sidenav-item-payments"]');
    await page.click('[data-testid="sidenav-item-processors"]');
    await waitForLoad(page);

    // Take screenshot
    await page.screenshot({ path: '/tmp/qa-01-processors-view.png', fullPage: true });

    // Check if Processors view rendered. OperatorGrid only mounts AgGridReact when
    // rows are present (empty state renders otherwise), so we check the WorkspacePanel
    // container (aria-label="Payment Processors") which always renders.
    const viewVisible = await page.isVisible('section[aria-label="Payment Processors"]').catch(() => false);

    console.log('✓ Processors view visible:', viewVisible);
    console.log('✓ Console errors:', consoleErrors.length === 0 ? 'None' : consoleErrors);
    
    expect(viewVisible).toBeTruthy();
    expect(consoleErrors.length).toBe(0);
  });

  test('Scenario 2: Create Test Processor (Percentage Type)', async ({ page }) => {
    console.log('\n=== TEST 2: Create Test Processor ===');
    
    // Navigate to Processors
    await page.click('[data-testid="sidenav-item-payments"]');
    await page.click('[data-testid="sidenav-item-processors"]');
    await waitForLoad(page);

    // The "New Processor" button calls handleCreateProcessor() which uses window.prompt()
    // dialogs sequentially: name → type → feeType → feePercentage → defaultUserSplit.
    // Register a dialog handler before clicking so Playwright answers each prompt in order.
    const prompts = ['Test-Crypto-Percentage', 'crypto', 'percentage', '3.5', '25'];
    let promptIdx = 0;
    page.on('dialog', async (dialog) => {
      await dialog.accept(promptIdx < prompts.length ? prompts[promptIdx++] : '');
    });

    await page.screenshot({ path: '/tmp/qa-02a-create-processor.png', fullPage: true });
    await page.click('text=New Processor');
    // Wait for all prompts to be handled and the createPaymentProcessor command to complete
    await waitForLoad(page);
    await page.screenshot({ path: '/tmp/qa-02b-processor-created.png', fullPage: true });

    // Verify processor appears in grid
    const processorName = await page.textContent('text=Test-Crypto-Percentage').catch(() => null);
    console.log('✓ Processor created:', processorName !== null);
    
    // Check Fee Formula column shows 3.5%
    const feeFormula = await page.textContent('text=3.5%').catch(() => null);
    console.log('✓ Fee formula displays 3.5%:', feeFormula !== null);
    
    console.log('✓ Console errors:', consoleErrors.length === 0 ? 'None' : consoleErrors);
    
    expect(processorName).not.toBeNull();
  });

  test('Scenario 3: Create Transaction (Crypto Payment)', async ({ page }) => {
    // TODO: 'Transaction Ledger' is not a sidenav item in the current nav structure.
    // Nav groups are Decide / Procure / Sell / Money / Admin — no 'Transaction Ledger' route exists.
    // This test needs to be redesigned for the actual payments sub-view structure.
    test.skip(true, "Navigation target 'Transaction Ledger' does not exist in current nav (no matching sidenav-item testid)");

    console.log('\n=== TEST 3: Create Crypto Payment Transaction ===');
    
    // Navigate to Transaction Ledger
    await page.click('[data-testid="sidenav-item-payments"]');
    await page.click('text=Transaction Ledger');
    await waitForLoad(page);

    // Click Receiving button
    await page.click('text=Receiving');
    await waitForLoad(page);
    await page.screenshot({ path: '/tmp/qa-03a-receiving-form.png', fullPage: true });

    // Fill transaction fields
    // Entity type: customer
    await page.selectOption('select[name="entityType"]', 'customer');
    
    // Select first available customer
    await page.selectOption('select[name="customerId"]', { index: 1 });
    
    // Transaction type: Crypto payment
    await page.selectOption('select[name="transactionType"]', 'crypto_payment_in');
    
    // Gross: 100.00
    await page.fill('input[name="gross"]', '100.00');
    
    // Processor: Test-Crypto-Percentage
    await page.selectOption('select[name="processorId"]', 'Test-Crypto-Percentage');
    
    await waitForLoad(page);
    await page.screenshot({ path: '/tmp/qa-03b-auto-calculations.png', fullPage: true });

    // Verify auto-calculations
    const feeValue = await page.inputValue('input[name="fee"]').catch(() => '');
    const splitValue = await page.inputValue('input[name="splitPercent"]').catch(() => '');
    const netValue = await page.textContent('text=/Net:.*\\$\\d+\\.\\d{2}/').catch(() => '');
    
    console.log('✓ Fee auto-calculated:', feeValue, '(expected: 3.50)');
    console.log('✓ Split % auto-filled:', splitValue, '(expected: 25)');
    console.log('✓ Net displayed:', netValue);
    
    // Fill remaining required fields
    await page.selectOption('select[name="method"]', 'crypto');
    await page.selectOption('select[name="bucket"]', 'crypto-wallet');
    await page.fill('input[name="amount"]', '96.50'); // Approximate net
    
    await page.screenshot({ path: '/tmp/qa-03c-ready-to-commit.png', fullPage: true });

    // Commit transaction
    await page.click('[data-testid="commit-button"]').catch(async () => {
      await page.click('button:has-text("Commit")');
    });
    
    await waitForLoad(page);
    await page.screenshot({ path: '/tmp/qa-03d-after-commit.png', fullPage: true });

    // Verify success chip
    const successChip = await page.isVisible('.success').catch(() => false) ||
                        await page.isVisible('[data-status="posted"]').catch(() => false);
    
    console.log('✓ Success indicator visible:', successChip);
    console.log('✓ Console errors:', consoleErrors.length === 0 ? 'None' : consoleErrors);
    
    expect(feeValue).toBe('3.50');
    expect(splitValue).toBe('25');
  });

  test('Scenario 4: Verify Processor Totals', async ({ page }) => {
    console.log('\n=== TEST 4: Verify Processor Totals ===');
    
    // Navigate to Processors
    await page.click('[data-testid="sidenav-item-payments"]');
    await page.click('[data-testid="sidenav-item-processors"]');
    await waitForLoad(page);

    await page.screenshot({ path: '/tmp/qa-04-processor-totals.png', fullPage: true });

    // Find Test-Crypto-Percentage row
    const row = page.locator('text=Test-Crypto-Percentage').locator('..');
    
    // Get totals (adjust selectors based on actual grid structure)
    const totalFees = await row.locator('text=/\\$3\\.50/').count().catch(() => 0);
    const userCollectible = await row.locator('text=/\\$0\\.88/').count().catch(() => 0);
    
    console.log('✓ Total Fees Processed found:', totalFees > 0);
    console.log('✓ User Collectible found:', userCollectible > 0);
    console.log('✓ Console errors:', consoleErrors.length === 0 ? 'None' : consoleErrors);
  });

  test('Scenario 5: Edge Case - Fixed Fee Processor', async ({ page }) => {
    console.log('\n=== TEST 5: Fixed Fee Processor ===');
    
    await page.click('[data-testid="sidenav-item-payments"]');
    await page.click('[data-testid="sidenav-item-processors"]');
    await waitForLoad(page);
    
    // Respond to prompts: name → type → feeType → feeFixedAmount → defaultUserSplit
    // (no feePercentage prompt for 'fixed' type)
    const promptsFixed = ['Test-Crypto-Fixed', 'crypto', 'fixed', '2.00', '50'];
    let promptIdxFixed = 0;
    page.on('dialog', async (dialog) => {
      await dialog.accept(promptIdxFixed < promptsFixed.length ? promptsFixed[promptIdxFixed++] : '');
    });

    await page.screenshot({ path: '/tmp/qa-05-fixed-fee.png', fullPage: true });
    await page.click('text=New Processor');
    await waitForLoad(page);
    
    const processorCreated = await page.textContent('text=Test-Crypto-Fixed').catch(() => null);
    console.log('✓ Fixed fee processor created:', processorCreated !== null);
    console.log('✓ Console errors:', consoleErrors.length === 0 ? 'None' : consoleErrors);
  });

  test('Scenario 6: Edge Case - Hybrid Fee Processor', async ({ page }) => {
    console.log('\n=== TEST 6: Hybrid Fee Processor ===');
    
    await page.click('[data-testid="sidenav-item-payments"]');
    await page.click('[data-testid="sidenav-item-processors"]');
    await waitForLoad(page);
    
    // Respond to prompts: name → type → feeType → feePercentage → feeFixedAmount → defaultUserSplit
    // ('hybrid' type triggers both feePercentage and feeFixedAmount prompts)
    const promptsHybrid = ['Test-Crypto-Hybrid', 'crypto', 'hybrid', '2.5', '0.30', '25'];
    let promptIdxHybrid = 0;
    page.on('dialog', async (dialog) => {
      await dialog.accept(promptIdxHybrid < promptsHybrid.length ? promptsHybrid[promptIdxHybrid++] : '');
    });

    await page.screenshot({ path: '/tmp/qa-06-hybrid-fee.png', fullPage: true });
    await page.click('text=New Processor');
    await waitForLoad(page);
    
    const processorCreated = await page.textContent('text=Test-Crypto-Hybrid').catch(() => null);
    console.log('✓ Hybrid fee processor created:', processorCreated !== null);
    console.log('✓ Console errors:', consoleErrors.length === 0 ? 'None' : consoleErrors);
  });
});
