// Shared helpers for buy lane
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const ROOT = '/Users/evan/work/terp-agro-operator-console/.ux-review-scratch';
const stateFor = (login) => path.join(ROOT, `state-buy-${login.split('@')[0]}.json`);
const ISSUES = path.join(ROOT, 'issues-buy.json');

function loadIssues() {
  try { return JSON.parse(fs.readFileSync(ISSUES, 'utf8')); } catch { return []; }
}
function saveIssues(issues) { fs.writeFileSync(ISSUES, JSON.stringify(issues, null, 2)); }

async function launch(login = 'intake@terpagro.local') {
  const browser = await chromium.launch();
  const STATE = stateFor(login);
  const ctxOpts = { viewport: { width: 1512, height: 945 }, permissions: ['clipboard-read', 'clipboard-write'] };
  if (fs.existsSync(STATE)) ctxOpts.storageState = STATE;
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  const issues = loadIssues();
  const toasts = [];
  page.on('console', m => { if (m.type() === 'error') issues.push({ type: 'console', text: m.text().slice(0, 300), url: page.url() }); });
  page.on('response', r => { if (r.status() >= 400) issues.push({ type: 'http ' + r.status(), url: r.url().slice(0, 200), page: page.url() }); });
  page.on('pageerror', e => issues.push({ type: 'pageerror', text: String(e).slice(0, 300), url: page.url() }));

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1500);
  if (await page.getByLabel('Email').isVisible().catch(() => false)) {
    await page.getByLabel('Email').fill(login);
    await page.getByLabel('Password').fill('terp-demo');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForTimeout(2500);
    await context.storageState({ path: STATE });
  }
  const done = async () => { saveIssues(issues); await browser.close(); };
  return { browser, context, page, issues, toasts, done };
}

// remove injected agentation dev-overlay that intercepts pointer events
async function nukeOverlay(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-agentation-root]').forEach(n => { n.style.pointerEvents = 'none'; n.querySelectorAll('*').forEach(c => c.style.pointerEvents = 'none'); });
  }).catch(() => {});
}

async function snap(page, name) {
  await page.screenshot({ path: path.join(ROOT, 'shots', `buy-${name}.png`) });
}

// capture visible toasts (sonner/radix style)
async function readToasts(page) {
  return page.evaluate(() => {
    const sels = ['[data-sonner-toast]', '[role="status"]', '.toast', '[data-radix-toast-announce-exclude]', 'li[role="status"]', '[aria-live]'];
    const out = new Set();
    for (const s of sels) document.querySelectorAll(s).forEach(el => { const t = el.innerText?.trim(); if (t) out.add(t.replace(/\s+/g, ' ').slice(0, 300)); });
    return [...out];
  });
}

async function aria(page, sel = 'body') {
  try { return await page.locator(sel).ariaSnapshot(); } catch (e) { return 'ARIA-ERR ' + e.message; }
}

module.exports = { launch, snap, readToasts, aria, nukeOverlay, ROOT };
