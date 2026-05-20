import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/server/schema.ts',
  // drizzle-kit artifacts go to ./drizzle/. The hand-written migrations
  // applied by src/server/migrate.ts live in ./migrations/ — see
  // ./migrations/README.md (issue #17 slice 2, MIG-03).
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://terp_agro:terp_agro@localhost:55432/terp_agro'
  }
});
