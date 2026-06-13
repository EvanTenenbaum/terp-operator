// Interactive driver for the sell lane. Polls for cmd-sell.js, evals it, writes out-sell.txt + out-sell.done
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname);
const CMD = path.join(DIR, 'cmd-sell.js');
const OUT = path.join(DIR, 'out-sell.txt');
const DONE = path.join(DIR, 'out-sell.done');
const ISSUES = path.join(DIR, 'issues-sell.json');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1512, height: 945 } });
  const issues = [];
  const saveIssues = () => fs.writeFileSync(ISSUES, JSON.stringify(issues, null, 2));
  page.on('console', m => { if (m.type() === 'error') { issues.push({ type: 'console', text: m.text().slice(0, 300), url: page.url(), ts: new Date().toISOString() }); saveIssues(); } });
  page.on('response', r => { if (r.status() >= 400) { issues.push({ type: 'http ' + r.status(), url: r.url().slice(0, 200), page: page.url(), ts: new Date().toISOString() }); saveIssues(); } });
  page.on('pageerror', e => { issues.push({ type: 'pageerror', text: String(e).slice(0, 300), url: page.url(), ts: new Date().toISOString() }); saveIssues(); });

  await page.goto('http://localhost:5173/');
  try {
    if (await page.getByLabel('Email').isVisible({ timeout: 4000 })) {
      await page.getByLabel('Email').fill('owner@terpagro.local');
      await page.getByLabel('Password').fill('terp-demo');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.waitForTimeout(2500);
    }
  } catch (e) { /* already signed in */ }
  fs.writeFileSync(path.join(DIR, 'driver-sell-ready.txt'), 'ready url=' + page.url());

  const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
  for (;;) {
    if (fs.existsSync(CMD)) {
      const code = fs.readFileSync(CMD, 'utf8');
      fs.unlinkSync(CMD);
      const lines = [];
      const log = (...a) => lines.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x, null, 1)).join(' '));
      const shot = async (name) => { await page.screenshot({ path: path.join(DIR, 'shots', 'sell-' + name + '.png') }); lines.push('[shot] sell-' + name + '.png'); };
      const aria = async (sel) => { try { return await page.locator(sel || 'body').ariaSnapshot(); } catch (e) { return 'aria failed: ' + e.message; } };
      try {
        const fn = new AsyncFunction('page', 'browser', 'log', 'issues', 'shot', 'aria', 'fs', code);
        await fn(page, browser, log, issues, shot, aria, fs);
        lines.push('[ok]');
      } catch (e) {
        lines.push('[error] ' + (e.stack || String(e)).slice(0, 2000));
      }
      saveIssues();
      fs.writeFileSync(OUT, lines.join('\n'));
      fs.writeFileSync(DONE, String(Date.now()));
      if (code.includes('__QUIT__')) { await browser.close(); process.exit(0); }
    }
    await new Promise(r => setTimeout(r, 250));
  }
})().catch(e => { fs.writeFileSync(path.join(DIR, 'driver-sell-ready.txt'), 'FATAL ' + (e.stack || e)); process.exit(1); });
