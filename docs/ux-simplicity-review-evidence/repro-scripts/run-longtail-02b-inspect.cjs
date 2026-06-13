// Inspect matchmaking DOM structure for proper locators.
const { start } = require('./lib-longtail.cjs');
(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const out = { selects: [], inputs: [], buttons: [] };
    document.querySelectorAll('select').forEach((s, i) => {
      const st = getComputedStyle(s);
      out.selects.push({ i, id: s.id, name: s.name, visible: st.display !== 'none' && st.visibility !== 'hidden' && s.offsetParent !== null, optCount: s.options.length, first3: Array.from(s.options).slice(0, 3).map(o => o.textContent.trim()), labelled: s.labels && s.labels[0] ? s.labels[0].textContent.trim() : (s.getAttribute('aria-label') || '') });
    });
    document.querySelectorAll('input').forEach((s, i) => {
      out.inputs.push({ i, type: s.type, id: s.id, placeholder: s.placeholder, visible: s.offsetParent !== null, labelled: s.labels && s.labels[0] ? s.labels[0].textContent.trim() : (s.getAttribute('aria-label') || '') });
    });
    document.querySelectorAll('button').forEach((b) => {
      const t = (b.textContent || '').trim();
      if (t && /Need|Stock|Accept|Dismiss|Outreach|note|Settings/i.test(t)) out.buttons.push({ text: t.slice(0, 60), disabled: b.disabled, visible: b.offsetParent !== null });
    });
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
