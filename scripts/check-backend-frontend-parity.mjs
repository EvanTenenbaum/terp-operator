import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const commandNames = parseCommandNames(read('src/shared/commandCatalog.ts'));
const queryNames = parseRouterNames(read('src/server/routers/queries.ts'));
const clientText = readClientSource();

const missingCommands = commandNames.filter((name) => !new RegExp(`runCommand\\(\\s*['"\`]${name}['"\`]`).test(clientText));
const missingQueries = queryNames.filter((name) => !clientText.includes(`queries.${name}`));

if (missingCommands.length || missingQueries.length) {
  console.error('Backend/frontend parity check failed.');
  if (missingCommands.length) console.error(`Commands missing a direct frontend runCommand surface: ${missingCommands.join(', ')}`);
  if (missingQueries.length) console.error(`Query endpoints missing a frontend query surface: ${missingQueries.join(', ')}`);
  process.exit(1);
}

console.log(`Backend/frontend parity OK: ${commandNames.length} surfaced commands and ${queryNames.length} query endpoints accounted for.`);

function parseCommandNames(source) {
  return parseConstStringArray(source, 'commandNames');
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
