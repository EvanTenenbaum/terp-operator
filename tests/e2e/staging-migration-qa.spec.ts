import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Staging environment
const BASE_URL = 'https://terp-agro-staging-5asc2.ondigitalocean.app';
const SCREENSHOTS_DIR = path.join(process.cwd(), 'artifacts', 'staging-qa-screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function captureConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`${msg.text()}`);
    }
  });
  page.on('pageerror', error => {
    errors.push(`Page Error: ${error.message}\n${error.stack}`);
  });
  return errors;
}

test.describe('Staging Migration QA - Critical Path', () => {
  let consoleErrors: string[];

  test.beforeEach(async ({ page }) => {
    consoleErrors = await captureConsoleErrors(page);
  });

  test('1. Health & Initial Load', async ({ page }) => {
    console.log('Testing: Health & Initial Load');
    
    // Navigate to staging
    const response = await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    
    // Verify no 500 errors
    expect(response?.status()).not.toBe(500);
    expect(response?.status()).toBeLessThan(500);
    
    // Wait for page to be ready
    await page.waitForLoadState('domcontentloaded');
    
    // Screenshot homepage
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, '01-homepage-initial-load.png'),
      fullPage: true 
    });
    
    // Check for visible content (not blank page)
    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(0);
    
    // Report console errors
    console.log('Console errors on initial load:', consoleErrors);
  });

  test('2. Authentication Flow', async ({ page }) => {
    console.log('Testing: Authentication');
    
    await page.goto(BASE_URL);
    
    // Look for login button/link - try common patterns
    const loginSelectors = [
      'text=Login',
      'text=Sign In',
      'text=Sign in',
      'a[href*="login"]',
      'button:has-text("Login")',
      '[data-testid="login"]',
      '.login-button',
    ];
    
    let loginFound = false;
    for (const selector of loginSelectors) {
      const loginElement = await page.locator(selector).first();
      if (await loginElement.isVisible().catch(() => false)) {
        await loginElement.click();
        loginFound = true;
        break;
      }
    }
    
    if (!loginFound) {
      console.log('Warning: No login button found, checking if already on login page');
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '02a-no-login-button.png'),
        fullPage: true 
      });
    }
    
    // Wait a bit for navigation
    await page.waitForTimeout(2000);
    
    // Look for login form
    const emailInput = await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    const passwordInput = await page.locator('input[type="password"], input[name="password"]').first();
    
    if (await emailInput.isVisible() && await passwordInput.isVisible()) {
      // Fill credentials
      await emailInput.fill('owner@terpagro.local');
      await passwordInput.fill('terp-demo');
      
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '02b-login-form-filled.png'),
        fullPage: true 
      });
      
      // Submit form
      const submitSelectors = [
        'button[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("Sign In")',
      ];
      
      for (const selector of submitSelectors) {
        const submitBtn = await page.locator(selector).first();
        if (await submitBtn.isVisible().catch(() => false)) {
          await submitBtn.click();
          break;
        }
      }
      
      // Wait for navigation/response
      await page.waitForTimeout(3000);
      
      // Screenshot after login
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '02c-after-login.png'),
        fullPage: true 
      });
      
      // Check if we're logged in (look for dashboard elements)
      const currentUrl = page.url();
      console.log('Current URL after login:', currentUrl);
      
      // Verify session (reload and check we're still logged in)
      await page.reload();
      await page.waitForTimeout(2000);
      
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '02d-after-reload.png'),
        fullPage: true 
      });
      
    } else {
      console.log('Error: Could not find login form inputs');
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '02-error-no-login-form.png'),
        fullPage: true 
      });
    }
    
    console.log('Console errors during auth:', consoleErrors);
  });

  test('3. Inventory/Batches View', async ({ page }) => {
    console.log('Testing: Inventory/Batches View');
    
    // Login first
    await page.goto(BASE_URL);
    await page.waitForTimeout(2000);
    
    const emailInput = await page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = await page.locator('input[type="password"]').first();
    
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill('owner@terpagro.local');
      await passwordInput.fill('terp-demo');
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(3000);
    }
    
    // Look for Inventory/Batches navigation
    const navSelectors = [
      'text=Inventory',
      'text=Batches',
      'a[href*="inventory"]',
      'a[href*="batches"]',
      '[data-testid*="inventory"]',
    ];
    
    let navFound = false;
    for (const selector of navSelectors) {
      const navElement = await page.locator(selector).first();
      if (await navElement.isVisible().catch(() => false)) {
        await navElement.click();
        navFound = true;
        await page.waitForTimeout(2000);
        break;
      }
    }
    
    if (!navFound) {
      console.log('Warning: Could not find Inventory navigation');
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '03-no-inventory-nav.png'),
        fullPage: true 
      });
    }
    
    // Screenshot batch list
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, '03a-batch-list.png'),
      fullPage: true 
    });
    
    // Look for batch table/grid
    const tables = await page.locator('table, [role="table"], .batch-list, .inventory-list').all();
    console.log('Found tables/grids:', tables.length);
    
    // Look for batch items and click first one
    const batchSelectors = [
      'tr:has-text("Batch")',
      '.batch-item',
      'a[href*="batch"]',
      '[data-testid*="batch"]',
    ];
    
    let batchClicked = false;
    for (const selector of batchSelectors) {
      const batchElements = await page.locator(selector).all();
      if (batchElements.length > 0) {
        console.log(`Found ${batchElements.length} batch items with selector: ${selector}`);
        try {
          await batchElements[0].click();
          batchClicked = true;
          await page.waitForTimeout(2000);
          
          // Screenshot batch detail
          await page.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, '03b-batch-detail.png'),
            fullPage: true 
          });
          break;
        } catch (e) {
          console.log(`Could not click batch with selector ${selector}:`, e);
        }
      }
    }
    
    if (!batchClicked) {
      console.log('Warning: Could not find or click batch detail');
    }
    
    console.log('Console errors in inventory:', consoleErrors);
  });

  test('4. Filter Functionality', async ({ page }) => {
    console.log('Testing: Filter Functionality');
    
    // Login and navigate to inventory
    await page.goto(BASE_URL);
    await page.waitForTimeout(2000);
    
    const emailInput = await page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = await page.locator('input[type="password"]').first();
    
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill('owner@terpagro.local');
      await passwordInput.fill('terp-demo');
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(3000);
    }
    
    // Navigate to inventory
    const inventoryNav = await page.locator('text=Inventory, text=Batches, a[href*="inventory"]').first();
    if (await inventoryNav.isVisible().catch(() => false)) {
      await inventoryNav.click();
      await page.waitForTimeout(2000);
    }
    
    // Look for filter UI
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, '04a-before-filters.png'),
      fullPage: true 
    });
    
    const filterSelectors = [
      'text=Filter',
      'text=Filters',
      'button:has-text("Filter")',
      '[data-testid*="filter"]',
      'select[name*="filter"]',
      'select[name*="category"]',
      '.filter-dropdown',
    ];
    
    let filterFound = false;
    for (const selector of filterSelectors) {
      const filterElement = await page.locator(selector).first();
      if (await filterElement.isVisible().catch(() => false)) {
        console.log('Found filter UI with selector:', selector);
        filterFound = true;
        
        // Try to interact with filter
        try {
          await filterElement.click();
          await page.waitForTimeout(1000);
          
          await page.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, '04b-filter-opened.png'),
            fullPage: true 
          });
        } catch (e) {
          console.log('Could not click filter:', e);
        }
        break;
      }
    }
    
    if (!filterFound) {
      console.log('Warning: No filter UI found');
    }
    
    // Look for saved filters feature
    const savedFilterSelectors = [
      'text=Save Filter',
      'text=Saved Filters',
      'button:has-text("Save")',
      '[data-testid*="save-filter"]',
    ];
    
    let savedFilterFound = false;
    for (const selector of savedFilterSelectors) {
      const savedFilterElement = await page.locator(selector).first();
      if (await savedFilterElement.isVisible().catch(() => false)) {
        console.log('Found saved filter UI with selector:', selector);
        savedFilterFound = true;
        
        await page.screenshot({ 
          path: path.join(SCREENSHOTS_DIR, '04c-saved-filters.png'),
          fullPage: true 
        });
        break;
      }
    }
    
    if (!savedFilterFound) {
      console.log('Note: Saved filters feature not found (might not be deployed yet)');
    }
    
    console.log('Console errors in filters:', consoleErrors);
  });

  test('5. Sales Orders', async ({ page }) => {
    console.log('Testing: Sales Orders');
    
    // Login
    await page.goto(BASE_URL);
    await page.waitForTimeout(2000);
    
    const emailInput = await page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = await page.locator('input[type="password"]').first();
    
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill('owner@terpagro.local');
      await passwordInput.fill('terp-demo');
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(3000);
    }
    
    // Look for Sales/Orders navigation
    const navSelectors = [
      'text=Sales',
      'text=Orders',
      'text=Sales Orders',
      'a[href*="sales"]',
      'a[href*="orders"]',
    ];
    
    let navFound = false;
    for (const selector of navSelectors) {
      const navElement = await page.locator(selector).first();
      if (await navElement.isVisible().catch(() => false)) {
        await navElement.click();
        navFound = true;
        await page.waitForTimeout(2000);
        break;
      }
    }
    
    if (!navFound) {
      console.log('Warning: Could not find Sales navigation');
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '05-no-sales-nav.png'),
        fullPage: true 
      });
    } else {
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '05-sales-orders.png'),
        fullPage: true 
      });
    }
    
    console.log('Console errors in sales:', consoleErrors);
  });

  test('6. Purchase Orders', async ({ page }) => {
    console.log('Testing: Purchase Orders');
    
    // Login
    await page.goto(BASE_URL);
    await page.waitForTimeout(2000);
    
    const emailInput = await page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = await page.locator('input[type="password"]').first();
    
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill('owner@terpagro.local');
      await passwordInput.fill('terp-demo');
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(3000);
    }
    
    // Look for Purchase Orders navigation
    const navSelectors = [
      'text=Purchase',
      'text=Purchase Orders',
      'a[href*="purchase"]',
    ];
    
    let navFound = false;
    for (const selector of navSelectors) {
      const navElement = await page.locator(selector).first();
      if (await navElement.isVisible().catch(() => false)) {
        await navElement.click();
        navFound = true;
        await page.waitForTimeout(2000);
        break;
      }
    }
    
    if (!navFound) {
      console.log('Warning: Could not find Purchase Orders navigation');
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '06-no-po-nav.png'),
        fullPage: true 
      });
    } else {
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '06-purchase-orders.png'),
        fullPage: true 
      });
    }
    
    console.log('Console errors in POs:', consoleErrors);
  });

  test('7. Navigation & General UX', async ({ page }) => {
    console.log('Testing: Navigation & General UX');
    
    // Login
    await page.goto(BASE_URL);
    await page.waitForTimeout(2000);
    
    const emailInput = await page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = await page.locator('input[type="password"]').first();
    
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill('owner@terpagro.local');
      await passwordInput.fill('terp-demo');
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(3000);
    }
    
    // Screenshot main navigation
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, '07a-main-navigation.png'),
      fullPage: true 
    });
    
    // Try to find and click through main nav items
    const navItems = await page.locator('nav a, .nav-link, [role="navigation"] a').all();
    console.log(`Found ${navItems.length} navigation items`);
    
    for (let i = 0; i < Math.min(navItems.length, 5); i++) {
      try {
        const text = await navItems[i].textContent();
        console.log(`Clicking nav item ${i + 1}: ${text}`);
        
        await navItems[i].click();
        await page.waitForTimeout(1500);
        
        // Check for blank page or error
        const bodyText = await page.textContent('body');
        if (bodyText && bodyText.length < 50) {
          console.log(`Warning: Nav item ${i + 1} leads to very sparse page`);
        }
        
        await page.screenshot({ 
          path: path.join(SCREENSHOTS_DIR, `07b-nav-${i + 1}.png`),
          fullPage: true 
        });
      } catch (e) {
        console.log(`Could not test nav item ${i + 1}:`, e);
      }
    }
    
    console.log('Console errors during navigation:', consoleErrors);
  });
});
