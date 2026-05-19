import 'dotenv/config';
import { z } from 'zod';

const DEV_SESSION_SECRET = 'dev-only-change-this-session-secret';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().url().default('postgres://terp_agro:terp_agro@localhost:55432/terp_agro'),
  DATABASE_SSL: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  SESSION_SECRET: z.string().min(16).default(DEV_SESSION_SECRET),
  VITE_AG_GRID_LICENSE_KEY: z.string().default(''),
  JOURNAL_DIR: z.string().default('./storage/journal'),
  ARCHIVE_DIR: z.string().default('./storage/archives'),
  // Photography feature flag. Defaults ON for dev; production toggles via deploy env.
  // Any value other than 'true' (case-insensitive) disables the upload + serving routes.
  ENABLE_PHOTOGRAPHY: z.string().optional().transform((value) => {
    if (value === undefined) return true;
    return value.toLowerCase() === 'true';
  })
});

export const env = envSchema.parse(process.env);
if (env.NODE_ENV === 'production' && env.SESSION_SECRET === DEV_SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set to a strong production secret.');
}
export const isProd = env.NODE_ENV === 'production';
