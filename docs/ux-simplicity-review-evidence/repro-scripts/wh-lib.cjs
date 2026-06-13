// Shared helpers for warehouse lane
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const ROOT = '/Users/evan/work/terp-agro-operator-console/.ux-review-scratch';
const STATE = path.join(ROOT, 'state-warehouse.json');
const ISSUES = path.join(ROOT, 'issues-warehouse.json');

function loadIssues() {
  try { return JSON.parse(fs.readFileSync(ISSUES, 'utf8')); } catch { return []; }
}
function saveIssues(issues) { fs.writeFileSync(ISSUES, JSON.stringify(issues, null, 2)); }

function wireIssues(page, issues) {
  page.on('console', m => { if (m.type() === 'error') issues.push({ type: 'console', text: m.text().slice(0, 300), url: page.url() }); });
  page.on('response', r => { if (r.status() >= 400) issues.push({ type: 'http ' + r.status(), url: r.url().slice(0, 200), page: page.url() }); });
  page.on('pageerror', e => issues.push({ type: 'pageerror', text: String(e).slice(0, 300), url: page.url() }));
}

async function launch(opts = {}) {
  const login = opts.login || 'owner@terpagro.local';
  const viewport = opts.viewport || { width: 1512, height: 945 };
  const browser = await chromium.launch();
  const ctxOpts = { viewport };
  if (fs.existsSync(STATE)) ctxOpts.storageState = STATE;
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  const issues = loadIssues();
  wireIssues(page, issues);

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
  return { browser, context, page, issues, done };
}

async function snap(page, name) {
  await page.screenshot({ path: path.join(ROOT, 'shots', `warehouse-${name}.png`) });
}

async function readToasts(page) {
  return page.evaluate(() => {
    const sels = ['[data-sonner-toast]', '[role="status"]', '.toast', 'li[role="status"]', '[aria-live]'];
    const out = new Set();
    for (const s of sels) document.querySelectorAll(s).forEach(el => { const t = el.innerText?.trim(); if (t) out.add(t.replace(/\s+/g, ' ').slice(0, 300)); });
    return [...out];
  });
}

async function aria(page, sel = 'body') {
  try { return await page.locator(sel).ariaSnapshot(); } catch (e) { return 'ARIA-ERR ' + e.message; }
}

module.exports = { launch, snap, readToasts, aria, wireIssues, ROOT };
