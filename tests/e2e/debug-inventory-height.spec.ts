import { test } from '@playwright/test';

test('verify workspace-panel-content display property', async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForLoadState('networkidle');

  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: /Inventory/ }).click();
  await page.waitForLoadState('networkidle');

  await page.waitForSelector('.ag-theme-quartz.grid-shell', { timeout: 15_000 });
  await page.waitForTimeout(1500);

  const result = await page.evaluate(() => {
    const wpContent = document.querySelector('.workspace-panel-content') as HTMLElement;
    const gridShell = document.querySelector('.ag-theme-quartz.grid-shell') as HTMLElement;

    // Check if display:flex is set directly or by a specific rule
    const wpContentStyle = window.getComputedStyle(wpContent);
    const wpContentDisplay = wpContentStyle.display;

    // Check the matched CSS rules
    const matchedRules: string[] = [];
    try {
      const styleSheets = Array.from(document.styleSheets);
      for (const sheet of styleSheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule) {
              if (wpContent.matches(rule.selectorText)) {
                if (rule.style.display) {
                  matchedRules.push(`${rule.selectorText} { display: ${rule.style.display}; }`);
                }
              }
            }
          }
        } catch (e) {
          // cross-origin sheet, skip
        }
      }
    } catch (e) {}

    // Check inline style
    const wpContentInlineStyle = wpContent.getAttribute('style') || '(none)';

    // Check if any parent is a flex/grid container that might affect display
    const parent = wpContent.parentElement;
    const parentDisplay = parent ? window.getComputedStyle(parent).display : 'N/A';

    // Trace the ag-root-wrapper height issue more carefully
    const agRoot = document.querySelector('.ag-root-wrapper') as HTMLElement;
    const agRootWrapperParent = agRoot?.parentElement as HTMLElement;
    const agRootWrapperGrandparent = agRootWrapperParent?.parentElement as HTMLElement;
    
    // Get all the CSS rules that match agRootWrapperParent (the wrapper div)
    const wrapperRules: string[] = [];
    try {
      const styleSheets = Array.from(document.styleSheets);
      for (const sheet of styleSheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule) {
              if (agRootWrapperParent && agRootWrapperParent.matches(rule.selectorText)) {
                wrapperRules.push(`${rule.selectorText} { ${rule.style.cssText.replace(/\s+/g, ' ').trim()} }`);
              }
            }
          }
        } catch (e) {}
      }
    } catch (e) {}

    return {
      wpContentDisplay,
      wpContentInlineStyle,
      wpContentParentDisplay: parentDisplay,
      matchedDisplayRules: matchedRules,
      wrapperDivInlineStyle: agRootWrapperParent?.getAttribute('style') || '(none)',
      wrapperDivComputedDisplay: agRootWrapperParent ? window.getComputedStyle(agRootWrapperParent).display : 'N/A',
      wrapperDivComputedHeight: agRootWrapperParent ? window.getComputedStyle(agRootWrapperParent).height : 'N/A',
      wrapperRules,
      gridShellComputedDisplay: window.getComputedStyle(gridShell).display,
      gridShellComputedHeight: window.getComputedStyle(gridShell).height,
      gridShellInlineStyle: gridShell.getAttribute('style') || '(none)',
    };
  });

  console.log('========== DISPLAY PROPERTY VERIFICATION ==========');
  console.log(`.workspace-panel-content:`);
  console.log(`  computed display: ${result.wpContentDisplay}`);
  console.log(`  inline style: ${result.wpContentInlineStyle}`);
  console.log(`  parent display: ${result.wpContentParentDisplay}`);
  console.log(`  matched rules with display: ${JSON.stringify(result.matchedDisplayRules)}`);
  console.log('');
  console.log(`.grid-shell:`);
  console.log(`  computed display: ${result.gridShellComputedDisplay}`);
  console.log(`  computed height: ${result.gridShellComputedHeight}`);
  console.log(`  inline style: ${result.gridShellInlineStyle}`);
  console.log('');
  console.log(`AG Grid wrapper div (between .grid-shell and .ag-root-wrapper):`);
  console.log(`  computed display: ${result.wrapperDivComputedDisplay}`);
  console.log(`  computed height: ${result.wrapperDivComputedHeight}`);
  console.log(`  inline style: ${result.wrapperDivInlineStyle}`);
  console.log(`  matched CSS rules:`);
  for (const rule of result.wrapperRules) {
    console.log(`    ${rule}`);
  }
});
