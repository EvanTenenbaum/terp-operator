import fs from 'node:fs';
import { execSync } from 'node:child_process';

const [source = '.do/terp-agro-staging.yaml', target = 'artifacts/terp-agro-staging.rendered.yaml'] = process.argv.slice(2);

const branch =
  process.env.STAGING_BRANCH ||
  process.env.GITHUB_REF_NAME ||
  safeExec('git branch --show-current') ||
  'main';
const appOrigin = process.env.STAGING_APP_ORIGIN || 'https://terp-agro-staging.ondigitalocean.app';
const databaseUrl = process.env.TERP_AGRO_STAGING_DATABASE_URL || process.env.DATABASE_URL || '';
const sessionSecret = process.env.TERP_AGRO_STAGING_SESSION_SECRET || process.env.SESSION_SECRET || '';
const agGridLicense = process.env.VITE_AG_GRID_LICENSE_KEY || '';

if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
  throw new Error('TERP_AGRO_STAGING_DATABASE_URL or DATABASE_URL must be set to a Postgres connection string.');
}

if (sessionSecret.length < 16) {
  throw new Error('TERP_AGRO_STAGING_SESSION_SECRET or SESSION_SECRET must be set to at least 16 characters.');
}

let spec = fs.readFileSync(source, 'utf8');
spec = spec
  .replaceAll('__BRANCH__', branch)
  .replaceAll('__APP_ORIGIN__', appOrigin)
  .replaceAll('__DATABASE_URL__', databaseUrl)
  .replaceAll('__SESSION_SECRET__', sessionSecret)
  .replaceAll('__AG_GRID_LICENSE_KEY__', agGridLicense || 'not-set-for-staging');

fs.mkdirSync(dirname(target), { recursive: true });
fs.writeFileSync(target, spec);
console.log(target);

function safeExec(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function dirname(file) {
  const index = file.lastIndexOf('/');
  return index === -1 ? '.' : file.slice(0, index);
}
