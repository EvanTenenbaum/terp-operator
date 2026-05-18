/**
 * Extract the component inventory from src/client/components/.
 *
 * Writes docs/design-system/components/_inventory.json with one entry per
 * .tsx file: name, path, inferred category, exported symbols.
 *
 * Run: `pnpm docs:inventory` (see package.json).
 *
 * Uses Node's native fs only — no `glob` dependency.
 */

import fs from 'node:fs';
import path from 'node:path';

interface ComponentEntry {
  name: string;
  path: string;
  category: 'grid' | 'drawer' | 'navigation' | 'form' | 'hook' | 'other';
  exports: string[];
}

const REPO_ROOT = process.cwd();
const COMPONENTS_DIR = path.join(REPO_ROOT, 'src/client/components');
const OUTPUT_PATH = path.join(REPO_ROOT, 'docs/design-system/components/_inventory.json');

const EXPORT_REGEX = /export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+(\w+)/g;

function categorize(name: string, content: string): ComponentEntry['category'] {
  if (name.startsWith('use')) return 'hook';
  if (/Grid|StatusPill|Expansion(Chevron|Panel)|KpiCard|EmptyState/i.test(name)) return 'grid';
  if (/Drawer|Sidecar|Panel(?!.*Grid)|FinderPanel/i.test(name)) return 'drawer';
  if (/Palette|Hotkeys|Shell|IdentityRibbon|ToastCenter|Nav/i.test(name)) return 'navigation';
  if (/Dialog|Form|FilterBuilder|FiltersDropdown/i.test(name)) return 'form';
  if (content.includes("from 'ag-grid-react'")) return 'grid';
  return 'other';
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      // Skip test files
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;
      out.push(full);
    }
  }
  return out;
}

function extractExports(content: string): string[] {
  const names = new Set<string>();
  EXPORT_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EXPORT_REGEX.exec(content)) !== null) {
    names.add(match[1]);
  }
  return [...names].sort();
}

function relativeFromRoot(absolute: string): string {
  return path.relative(REPO_ROOT, absolute).replaceAll(path.sep, '/');
}

function main(): void {
  if (!fs.existsSync(COMPONENTS_DIR)) {
    console.error(`Components directory not found: ${COMPONENTS_DIR}`);
    process.exit(1);
  }

  const files = listSourceFiles(COMPONENTS_DIR).sort();
  const components: ComponentEntry[] = files.map((file) => {
    const content = fs.readFileSync(file, 'utf-8');
    const name = path.basename(file, path.extname(file));
    return {
      name,
      path: relativeFromRoot(file),
      category: categorize(name, content),
      exports: extractExports(content)
    };
  });

  const summary = {
    generated: new Date().toISOString(),
    componentCount: components.length,
    byCategory: components.reduce<Record<string, number>>((acc, c) => {
      acc[c.category] = (acc[c.category] ?? 0) + 1;
      return acc;
    }, {}),
    components
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2) + '\n');

  console.log(`✓ Extracted ${components.length} components → ${relativeFromRoot(OUTPUT_PATH)}`);
  for (const [category, count] of Object.entries(summary.byCategory).sort()) {
    console.log(`  ${category}: ${count}`);
  }
}

main();
