import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://terp-agro-staging-5asc2.ondigitalocean.app';
const SCREENSHOTS_DIR = path.join(process.cwd(), 'artifacts', 'staging-qa-screenshots');

test.describe('Deep Batch Data Inspection', () => {
  test('Inspect batch table columns and data', async ({ page }) => {
    console.log('Deep inspection of batch data and columns');
    
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
    
    // Navigate to Inventory
    const inventoryLink = await page.locator('text=Inventory, a[href*="inventory"]').first();
    if (await inventoryLink.isVisible().catch(() => false)) {
      await inventoryLink.click();
      await page.waitForTimeout(2000);
    }
    
    // Take a full screenshot of the inventory page
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'deep-01-inventory-full.png'),
      fullPage: true 
    });
    
    // Look for the batch table
    const table = await page.locator('table, [role="grid"]').first();
    
    // Get all table headers
    const headers = await page.locator('table th, [role="columnheader"]').allTextContents();
    console.log('Table headers found:', headers);
    
    // Look for new columns from migration
    const expectedColumns = ['subcategory', 'brand', 'vendor'];
    for (const col of expectedColumns) {
      const found = headers.some(h => h.toLowerCase().includes(col));
      console.log(`Column "${col}" present in headers: ${found}`);
    }
    
    // Get first few rows of data
    const rows = await page.locator('table tbody tr, [role="row"]').all();
    console.log(`Found ${rows.length} rows in batch table`);
    
    if (rows.length > 0) {
      // Click first row to see detail
      try {
        await rows[0].click();
        await page.waitForTimeout(2000);
        
        await page.screenshot({ 
          path: path.join(SCREENSHOTS_DIR, 'deep-02-first-batch-detail.png'),
          fullPage: true 
        });
        
        // Get all text content from the detail view
        const detailText = await page.textContent('body');
        console.log('Detail view contains "brand":', detailText?.toLowerCase().includes('brand'));
        console.log('Detail view contains "subcategory":', detailText?.toLowerCase().includes('subcategory'));
        
      } catch (e) {
        console.log('Could not click first row:', e);
      }
    }
    
    // Check console for errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    console.log('Console errors:', consoleErrors);
  });

  test('Test filter grid input', async ({ page }) => {
    console.log('Testing filter grid input');
    
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
    
    // Navigate to Inventory
    const inventoryLink = await page.locator('text=Inventory').first();
    if (await inventoryLink.isVisible().catch(() => false)) {
      await inventoryLink.click();
      await page.waitForTimeout(2000);
    }
    
    // Look for "Filter grid" input
    const filterInput = await page.locator('input[placeholder*="Filter" i], input[placeholder*="Search" i]').first();
    
    if (await filterInput.isVisible().catch(() => false)) {
      console.log('Found filter input, testing...');
      
      // Take before screenshot
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, 'deep-03-before-filter.png'),
        fullPage: true 
      });
      
      // Type in filter
      await filterInput.fill('extract');
      await page.waitForTimeout(1000);
      
      // Take after screenshot
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, 'deep-04-after-filter-extract.png'),
        fullPage: true 
      });
      
      // Count visible rows
      const visibleRows = await page.locator('table tbody tr:visible, [role="row"]:visible').count();
      console.log('Visible rows after filter:', visibleRows);
      
      // Clear filter
      await filterInput.clear();
      await page.waitForTimeout(1000);
      
      const allRows = await page.locator('table tbody tr:visible, [role="row"]:visible').count();
      console.log('Visible rows after clear:', allRows);
      
    } else {
      console.log('No filter input found');
    }
  });

  test('Check for any obvious UI breaks or errors', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(`CONSOLE ERROR: ${msg.text()}`);
      }
    });
    
    page.on('pageerror', error => {
      errors.push(`PAGE ERROR: ${error.message}\n${error.stack}`);
    });
    
    page.on('response', response => {
      if (response.status() >= 400) {
        errors.push(`HTTP ${response.status()}: ${response.url()}`);
      }
    });
    
    // Login
    await page.goto(BASE_URL);
    await page.waitForTimeout(2000);
    
    const emailInput = await page.locator('input[type="email"]').first();
    const passwordInput = await page.locator('input[type="password"]').first();
    
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill('owner@terpagro.local');
      await passwordInput.fill('terp-demo');
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(3000);
    }
    
    // Visit key pages and look for errors
    const pagesToTest = [
      { name: 'Dashboard', selector: 'text=Dashboard' },
      { name: 'Inventory', selector: 'text=Inventory' },
      { name: 'Sales', selector: 'text=Sales' },
      { name: 'Purchase Orders', selector: 'text=Purchase Orders' },
    ];
    
    for (const pageTest of pagesToTest) {
      console.log(`Testing page: ${pageTest.name}`);
      
      const link = await page.locator(pageTest.selector).first();
      if (await link.isVisible().catch(() => false)) {
        await link.click();
        await page.waitForTimeout(2000);
        
        // Check for visible error messages
        const errorMessages = await page.locator('text=/error|failed|broken/i').allTextContents();
        if (errorMessages.length > 0) {
          console.log(`  Found error text: ${errorMessages.join(', ')}`);
        }
      }
    }
    
    console.log('\n=== ERROR SUMMARY ===');
    if (errors.length === 0) {
      console.log('No errors detected!');
    } else {
      errors.forEach((err, i) => {
        console.log(`${i + 1}. ${err}`);
      });
    }
    
    // Write errors to file
    if (errors.length > 0) {
      fs.writeFileSync(
        path.join(SCREENSHOTS_DIR, 'errors.txt'),
        errors.join('\n\n')
      );
    }
  });
});
