// Shared driver for money-lane UX review. Reuses storage state to skip login.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);
const STATE = (login) => path.join(ROOT, `state-money-${login.split('@')[0]}.json`);
const ISSUES = path.join(ROOT, 'issues-money.json');

function loadIssues() {
  try { return JSON.parse(fs.readFileSync(ISSUES, 'utf8')); } catch { return []; }
}
function saveIssues(issues) {
  fs.writeFileSync(ISSUES, JSON.stringify(issues, null, 2));
}

async function start(login = 'owner@terpagro.local') {
  const browser = await chromium.launch();
  const hasState = fs.existsSync(STATE(login));
  const context = await browser.newContext({
    viewport: { width: 1512, height: 945 },
    ...(hasState ? { storageState: STATE(login) } : {}),
  });
  const page = await context.newPage();
  const issues = loadIssues();
  const note = (o) => { issues.push({ ts: new Date().toISOString(), ...o }); };
  page.on('console', m => { if (m.type() === 'error') note({ type: 'console', text: m.text().slice(0, 300), url: page.url() }); });
  page.on('response', r => { if (r.status() >= 400) note({ type: 'http ' + r.status(), url: r.url().slice(0, 200), page: page.url() }); });
  page.on('pageerror', e => note({ type: 'pageerror', text: String(e).slice(0, 300), url: page.url() }));

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1500);
  if (await page.getByLabel('Email').isVisible().catch(() => false)) {
    await page.getByLabel('Email').fill(login);
    await page.getByLabel('Password').fill('terp-demo');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForTimeout(2500);
    await context.storageState({ path: STATE(login) });
  }

  const shot = async (name) => {
    const p = path.join(ROOT, 'shots', `money-${name}.png`);
    await page.screenshot({ path: p });
    console.log('SHOT', p);
  };
  const finish = async () => { saveIssues(issues); await browser.close(); };
  return { browser, context, page, issues, note, shot, finish };
}

module.exports = { start };
