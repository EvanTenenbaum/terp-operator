// Shared driver for longtail-lane UX review. Reuses storage state to skip login.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);
const STATE = (login) => path.join(ROOT, `state-longtail-${login.split('@')[0]}.json`);
const ISSUES = path.join(ROOT, 'issues-longtail.json');

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
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!(await page.getByLabel('Email').isVisible().catch(() => false))) break;
    await page.getByLabel('Email').fill(login);
    await page.getByLabel('Password').fill('terp-demo');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForTimeout(3000);
    if (await page.getByRole('button', { name: 'Sign out' }).isVisible().catch(() => false)) {
      await context.storageState({ path: STATE(login) });
      break;
    }
    console.log('login attempt', attempt + 1, 'did not land; retrying');
    await page.reload(); await page.waitForTimeout(1500);
  }
  if (await page.getByLabel('Email').isVisible().catch(() => false)) throw new Error('LOGIN FAILED after retries');

  const shot = async (name) => {
    const p = path.join(ROOT, 'shots', `longtail-${name}.png`);
    await page.screenshot({ path: p });
    console.log('SHOT', p);
  };
  // dump readable text of current page for offline analysis
  const dump = async (label) => {
    const txt = await page.locator('body').innerText().catch(() => '(no body)');
    console.log(`\n===== DUMP ${label} [${page.url()}] =====\n${txt.slice(0, 6000)}\n===== END ${label} =====`);
  };
  const aria = async (label, sel = 'body') => {
    try {
      const snap = await page.locator(sel).ariaSnapshot();
      console.log(`\n===== ARIA ${label} =====\n${snap.slice(0, 8000)}\n===== END ARIA ${label} =====`);
    } catch (e) { console.log('ARIA fail', label, String(e).slice(0, 120)); }
  };
  const finish = async () => { saveIssues(issues); await browser.close(); };
  return { browser, context, page, issues, note, shot, dump, aria, finish };
}

module.exports = { start };
