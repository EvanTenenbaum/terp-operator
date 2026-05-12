import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'docs/product/north-stars.md',
  'docs/product/work-loops.md',
  'docs/product/capability-registry.md',
  'docs/roadmap/2026-frontend-direction-roadmap.md',
  'docs/roadmap/integration-notes.md',
  'docs/roadmap/open-disagreements.md',
  'docs/roadmap/handoff-to-writing-plans.md',
  'docs/roadmap/pm-integration-state/Prompt.md',
  'docs/roadmap/pm-integration-state/Plan.md',
  'docs/roadmap/pm-integration-state/Implement.md',
  'docs/roadmap/pm-integration-state/Documentation.md',
  'docs/design/replication-playbook.md',
];

const phaseFiles = ['0a', '0b', '1', '2', '3', '4', '5', '6', '7'].map(
  (phase) => `docs/roadmap/phase-readiness/${phase}.md`,
);

const errors = [];

for (const file of [...requiredFiles, ...phaseFiles]) {
  if (!fs.existsSync(abs(file))) errors.push(`Missing required file: ${file}`);
}

const registry = readIfExists('docs/product/capability-registry.md');
const roadmap = readIfExists('docs/roadmap/2026-frontend-direction-roadmap.md');
const handoff = readIfExists('docs/roadmap/handoff-to-writing-plans.md');
const packageJson = readIfExists('package.json');

expectIds(registry, 'CAP', 1, 28, 3);
expectIds(registry, 'BE', 1, 10, 3);
expectIds(registry, 'REJ', 1, 6, 3);
expectRecipes(registry);

for (const phase of ['0a', '0b', '1', '2', '3', '4', '5', '6', '7']) {
  if (!roadmap.includes(`Phase ${phase}`) && !roadmap.includes(`phase ${phase}`)) {
    errors.push(`Roadmap does not mention Phase ${phase}.`);
  }
  const phaseText = readIfExists(`docs/roadmap/phase-readiness/${phase}.md`);
  for (const required of [
    'Required Reading',
    'Prerequisites',
    'Scope',
    'Feature Flag',
    'Pre-Flight Checks',
    'Acceptance Evidence',
    'Smoke Test',
    'Rollback',
  ]) {
    if (!phaseText.includes(required)) {
      errors.push(`Phase ${phase} readiness is missing section: ${required}`);
    }
  }
  if (!phaseText.includes('docs/design/replication-playbook.md')) {
    errors.push(`Phase ${phase} readiness must require Replication Playbook reading.`);
  }
}

for (const northStar of [
  'Spreadsheet first',
  'Operator fast',
  'Status first',
  'Ledger safe',
  'Reversible by design',
  'Familiar vocabulary',
  'Quiet power',
  'Customer safe by default',
  'Self-hosted privacy',
  'No bolt-ons',
]) {
  if (!readIfExists('docs/product/north-stars.md').includes(northStar)) {
    errors.push(`North-star doc missing: ${northStar}`);
  }
}

if (!handoff.includes('pnpm audit:product-roadmap')) {
  errors.push('Handoff must require pnpm audit:product-roadmap.');
}

if (!packageJson.includes('"audit:product-roadmap"')) {
  errors.push('package.json missing audit:product-roadmap script.');
}

if (!packageJson.includes('pnpm audit:product-roadmap')) {
  errors.push('package.json audit:self must include pnpm audit:product-roadmap.');
}

if (errors.length) {
  console.error('Product roadmap audit failed.');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Product roadmap audit OK: north stars, capability registry, phases, recipes, and handoff gates are present.');

function expectIds(text, prefix, start, end, width) {
  for (let i = start; i <= end; i += 1) {
    const id = `${prefix}-${String(i).padStart(width, '0')}`;
    if (!text.includes(id)) errors.push(`Capability registry missing ${id}.`);
  }
}

function expectRecipes(text) {
  for (let i = 1; i <= 16; i += 1) {
    const recipe = `R${i}`;
    if (!new RegExp(`\\b${recipe}\\b`).test(text)) {
      errors.push(`Capability registry missing Replication Playbook recipe ${recipe}.`);
    }
  }
}

function readIfExists(relativePath) {
  const file = abs(relativePath);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function abs(relativePath) {
  return path.join(root, relativePath);
}
