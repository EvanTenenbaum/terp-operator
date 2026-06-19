import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../../server/env';

export async function appendJsonlJournal(entry: Record<string, unknown>) {
  await fs.mkdir(env.JOURNAL_DIR, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const filePath = path.join(env.JOURNAL_DIR, `${day}.jsonl`);
  await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
  return filePath;
}

export async function checkJournalWritable() {
  await fs.mkdir(env.JOURNAL_DIR, { recursive: true });
  const probe = path.join(env.JOURNAL_DIR, '.healthcheck');
  await fs.writeFile(probe, String(Date.now()), 'utf8');
  await fs.rm(probe, { force: true });
}
