# Shared brief for UX coverage agents
- App: http://localhost:5173 (client) + :8787 (server). BOTH ALREADY RUNNING — never restart, never run `pnpm dev`, never kill node.
- Logins (password `terp-demo` for all): owner@terpagro.local, manager@terpagro.local, sales@terpagro.local, intake@terpagro.local, viewer@terpagro.local
- DB is a seeded demo Postgres — mutations are EXPECTED and fine, EXCEPT do not run: Closeout "Lock period"/"Archive", Recovery find-replace or correction commits, Settings→System JSON edits, credit-engine "bulk revert". You may open/preview those screens read-only.
- Create your OWN entities (new PO / new sale / new payment rows) and act on those, to avoid colliding with other agents running concurrently.
- Drive a HEADLESS playwright browser you launch yourself from the repo (cd /Users/evan/work/terp-agro-operator-console). Skeleton:
  ```js
  // save as .ux-review-scratch/run-<lane>.cjs ; run: node .ux-review-scratch/run-<lane>.cjs
  const { chromium } = require('@playwright/test');
  (async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1512, height: 945 } });
    const issues = [];
    page.on('console', m => { if (m.type() === 'error') issues.push({type:'console', text: m.text().slice(0,300), url: page.url()}); });
    page.on('response', r => { if (r.status() >= 400) issues.push({type:'http '+r.status(), url: r.url().slice(0,200), page: page.url()}); });
    page.on('pageerror', e => issues.push({type:'pageerror', text: String(e).slice(0,300), url: page.url()}));
    await page.goto('http://localhost:5173/');
    await page.getByLabel('Email').fill('LOGIN');
    await page.getByLabel('Password').fill('terp-demo');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForTimeout(2000);
    // ... your flow ...
    require('fs').writeFileSync('.ux-review-scratch/issues-<lane>.json', JSON.stringify(issues, null, 2));
    await browser.close();
  })().catch(e => { console.error(e); process.exit(1); });
  ```
  If already signed in (session cookie), the Email field won't exist — guard with a try/catch or check `page.getByLabel('Email').isVisible()`.
- Screenshots: page.screenshot({path: '.ux-review-scratch/shots/<lane>-<nn>-<desc>.png'}) at every anomaly + key flow moments.
- Record for EVERY flow: step count (clicks+keys), what feedback the operator got (toast? grid update? nothing?), anything broken/confusing/slow, dead buttons, silent failures, mislabeled things.
- KNOWN ISSUES — do not re-report: finder/QuickLedger unvirtualized giant tables; HTTP 431 customerLastOrderedQty batch on Sales customer select; Photography Queue expanded placement on Sales/Inventory; "TERP Agro" legacy naming; deferred items (intake grid convergence T05/H02, sellout linkage K03, per-loop hotkeys B02, PO-line paste C02, server note capture L02).
- Deliverable: write .ux-review-scratch/findings-<lane>.md — one `### F-<lane>-NN` block per finding: severity (S3 blocks/corrupts, S2 major friction, S1 annoying, S0 polish) × frequency (F3 daily…F0 rare), repro steps, expected vs actual, screenshot path. Include a "flows executed" appendix with step counts. Findings doc + issues JSON are your output; your final agent message should be a short summary + the file paths.
