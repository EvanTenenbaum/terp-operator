// Shared driver for chrome-lane (global chrome + keyboard) UX review.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const STATE = (login) => path.join(ROOT, `state-chrome-${login.split('@')[0]}.json`);
const ISSUES = path.join(ROOT, 'issues-chrome.json');

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
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  const issues = loadIssues();
  const note = (o) => { issues.push({ ts: new Date().toISOString(), lane: 'chrome', ...o }); console.log('ISSUE', JSON.stringify(o).slice(0, 300)); };
  page.on('console', m => { if (m.type() === 'error') note({ type: 'console', text: m.text().slice(0, 300), url: page.url() }); });
  page.on('response', r => { if (r.status() >= 400) note({ type: 'http ' + r.status(), url: r.url().slice(0, 200), page: page.url() }); });
  page.on('pageerror', e => note({ type: 'pageerror', text: String(e).slice(0, 300), url: page.url() }));

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1500);
  if (await page.getByLabel('Email').isVisible().catch(() => false)) {
    await page.getByLabel('Email').fill(login);
    await page.getByLabel('Password').fill('terp-demo');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForSelector('header.keel', { timeout: 30000 }).catch(() => console.log('WARN keel not visible after sign-in'));
    await page.waitForTimeout(1000);
    await context.storageState({ path: STATE(login) });
  } else {
    await page.waitForSelector('header.keel', { timeout: 30000 }).catch(() => console.log('WARN keel not visible (session restore)'));
  }

  const shot = async (name) => {
    const p = path.join(ROOT, 'shots', `chrome-${name}.png`);
    await page.screenshot({ path: p });
    console.log('SHOT', p);
  };
  // Dump visible toast texts
  const toasts = async () => {
    // ToastCenter renders into a fixed bottom-right stack (no toast class).
    const t = await page.evaluate(() => {
      const stack = document.querySelector('div.fixed.bottom-4.right-4');
      return stack ? Array.from(stack.children).map(e => e.textContent?.trim().slice(0, 250)).filter(Boolean) : [];
    });
    console.log('TOASTS', JSON.stringify(t));
    return t;
  };
  const key = async (combo) => { await page.keyboard.press(combo); await page.waitForTimeout(400); };
  // F-chrome-01 workaround: CommandPalette has a conditional-hook crash on every
  // open/close. heal() clicks the error boundary's "Try again" so coverage can continue.
  const heal = async () => {
    for (let i = 0; i < 3; i++) {
      const crashed = await page.locator('text=Something went wrong').first().isVisible().catch(() => false);
      if (!crashed) return i > 0;
      await page.getByRole('button', { name: 'Try again' }).click().catch(() => {});
      await page.waitForTimeout(700);
    }
    return true;
  };
  const finish = async () => { saveIssues(issues); await browser.close(); };
  return { browser, context, page, issues, note, shot, toasts, key, heal, finish };
}

module.exports = { start };
