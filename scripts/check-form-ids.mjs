#!/usr/bin/env node
/**
 * EXT-REVIEW 2026-06 finding #7 ("some fields lack IDs") — form-field audit.
 *
 * Scans src/client for <input>/<select>/<textarea> JSX controls and classifies:
 *   - identified:        has id= / aria-label / aria-labelledby
 *   - label-wrapped:     inside a <label> wrapper (implicit accessible name,
 *                        acceptable; FormField template is the preferred home)
 *   - NAKED:             no accessible name at all — fails the audit
 *
 * Ratchet: the NAKED count must be <= MAX_NAKED (currently 0 after the
 * 2026-06 remediation). Any new unlabeled control fails `pnpm audit:form-ids`
 * (wired into audit:self), so the finding cannot regress.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_NAKED = 0;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (p.endsWith('.tsx') && !p.includes('.test.')) yield p;
  }
}

/** Brace/string-aware scan to the end of the JSX open tag. */
function tagAttrs(s, start) {
  let i = start, depth = 0, instr = null;
  while (i < s.length) {
    const c = s[i];
    if (instr) { if (c === instr) instr = null; }
    else if (c === '"' || c === "'") instr = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return s.slice(start, i);
    i++;
  }
  return s.slice(start);
}

let identified = 0, wrapped = 0;
const naked = [];
for (const path of walk('src/client')) {
  const s = readFileSync(path, 'utf8');
  const re = /<(input|select|textarea)\b/g;
  let m;
  while ((m = re.exec(s))) {
    const attrs = tagAttrs(s, m.index + m[0].length);
    if (/\bid=/.test(attrs) || attrs.includes('aria-label')) { identified++; continue; }
    const before = s.slice(Math.max(0, m.index - 400), m.index);
    if (before.lastIndexOf('<label') > before.lastIndexOf('</label>')) { wrapped++; continue; }
    const line = s.slice(0, m.index).split('\n').length;
    // Skip controls that only appear inside comments/docstrings.
    const lineText = s.split('\n')[line - 1] ?? '';
    if (lineText.trimStart().startsWith('*') || lineText.trimStart().startsWith('//')) { continue; }
    naked.push(`${path}:${line}`);
  }
}

console.log(`[audit:form-ids] identified=${identified} label-wrapped=${wrapped} naked=${naked.length} (max ${MAX_NAKED})`);
if (naked.length > MAX_NAKED) {
  console.error('[audit:form-ids] FAIL — controls without any accessible name/id:');
  for (const n of naked) console.error('  ' + n);
  process.exit(1);
}
console.log('[audit:form-ids] PASS');
