import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const commandNames = parseCommandNames(read('src/shared/commandCatalog.ts'));
const internalOnlyCommandNames = parseCommandNames(read('src/shared/commandCatalog.ts'), 'internalOnlyCommandNames');
const pendingFrontendCommandNames = parseCommandNames(read('src/shared/commandCatalog.ts'), 'pendingFrontendCommandNames');
// Query endpoints that are implemented on the backend but whose frontend surface is pending.
// Remove each entry when the corresponding frontend usage lands.
// CAP-030 frontend: PR #186 (draft) — pickQueue, pickListWithLines, releaseEligibility
// commandJournal: internal diagnostic endpoint used by idempotency e2e tests via page.evaluate; not a UI-facing query
const pendingFrontendQueryNames = ['pickQueue', 'pickListWithLines', 'releaseEligibility', 'commandJournal', 'mergeCandidateCount', 'comboboxOptions'];
// mergeCandidateCount: backend endpoint exists; merge UI is a TODO (GH #264 removed the dead button, full UI pending)
const queryNames = parseRouterNames(read('src/server/routers/queries.ts'));
const clientText = readClientSource();
const entityActionsText = read("src/client/config/entity-actions.ts");

const commandSurfaceAliases = {
  logPayment: ['postTransactionLedgerRow']
};
const querySurfaceAliases = {
  csvExport: ['exportDataAsCsv']
};

const surfaceRequiredCommands = commandNames.filter((name) => !internalOnlyCommandNames.includes(name) && !pendingFrontendCommandNames.includes(name));
const missingCommands = surfaceRequiredCommands.filter((name) => !hasCommandSurface(name));
const missingQueries = queryNames.filter((name) => !hasQuerySurface(name) && !pendingFrontendQueryNames.includes(name));

if (missingCommands.length || missingQueries.length) {
  console.error('Backend/frontend parity check failed.');
  if (missingCommands.length) console.error(`Commands missing a direct frontend runCommand surface: ${missingCommands.join(', ')}`);
  if (missingQueries.length) console.error(`Query endpoints missing a frontend query surface: ${missingQueries.join(', ')}`);
  process.exit(1);
}

console.log(`Backend/frontend parity OK: ${surfaceRequiredCommands.length} surfaced commands, ${internalOnlyCommandNames.length} internal command(s), and ${queryNames.length} query endpoints accounted for.`);

function parseCommandNames(source, name = 'commandNames') {
  return parseConstStringArray(source, name);
}

function hasCommandSurface(name) {
  if (new RegExp(`runCommand\\(\\s*['"\`]${name}['"\`]`).test(clientText)) return true;
  // Commands surfaced through entity-actions config (id: 'commandName')
  if (new RegExp(`id:\\s*['"\`]${name}['"\`]`).test(entityActionsText)) return true;
  return (commandSurfaceAliases[name] ?? []).some((alias) => new RegExp(`runCommand\\(\\s*['"\`]${alias}['"\`]`).test(clientText));
}

function hasQuerySurface(name) {
  if (clientText.includes(`queries.${name}`)) return true;
  // Queries surfaced through domain routers (trpc.salesOrders.procedureName)
  if (new RegExp(`trpc\\.[a-zA-Z]+\\.${name}`).test(clientText)) return true;
  return (querySurfaceAliases[name] ?? []).some((alias) => clientText.includes(alias));
}

function parseConstStringArray(source, name) {
  const block = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\](?: as const| satisfies|;)`))?.[1];
  if (!block) throw new Error(`Unable to find ${name} block.`);
  return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function parseRouterNames(source) {
  return [...source.matchAll(/^\s{2}([a-zA-Z0-9_]+): protectedProcedure/gm)].map((match) => match[1]);
}

function readClientSource() {
  return listSourceFiles(path.join(root, 'src/client'))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
}

function listSourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}
