// usage: node sendcmd-sell.cjs <file-with-js | ->   (reads code, sends to driver, prints output)
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const CMD = path.join(DIR, 'cmd-sell.js');
const OUT = path.join(DIR, 'out-sell.txt');
const DONE = path.join(DIR, 'out-sell.done');
const src = process.argv[2];
const code = fs.readFileSync(src === '-' ? 0 : src, 'utf8');
if (fs.existsSync(DONE)) fs.unlinkSync(DONE);
fs.writeFileSync(CMD, code);
const t0 = Date.now();
(async () => {
  while (!fs.existsSync(DONE)) {
    if (Date.now() - t0 > 180000) { console.error('TIMEOUT waiting for driver'); process.exit(2); }
    await new Promise(r => setTimeout(r, 250));
  }
  console.log(fs.readFileSync(OUT, 'utf8'));
})();
