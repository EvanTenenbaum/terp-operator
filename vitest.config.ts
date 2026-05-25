import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // M4: DB-dependent tests (require live Postgres) are excluded from the
    // default vitest run. NAMING CONVENTION: any new test that requires a live
    // database connection must be named *.integration.test.ts or *.db.test.ts
    // so the glob patterns in CI workflows catch it automatically.
    // DO NOT add individual filenames to the workflow --exclude lists; use the
    // naming convention instead. Files listed today predate this convention.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/e2e/**'
    ],
    globals: true,
    // Default to node for server tests. Component tests opt in to jsdom via
    // `// @vitest-environment jsdom` at the top of each test file.
    environment: 'node',
    setupFiles: ['./src/client/test-setup.ts'],
    // Integration tests share a single Postgres database; running multiple
    // test files in parallel causes races on global tables like
    // `credit_recompute_queue` and `customers`. Disable file parallelism so
    // each file owns the DB while it runs. (Tests within a file remain
    // sequential by default.)
    fileParallelism: false,
    // v8 coverage instrumentation can multiply test time 3-4x. Bump from the
    // 5s default so userEvent interactions and dynamic imports don't time out
    // under coverage. Without coverage, tests complete in <2s.
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/server/services/creditEngine/**/*.ts'],
      exclude: [
        'src/server/services/creditEngine/**/*.test.ts',
        'src/server/services/creditEngine/index.ts'
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100
      }
    }
  }
});
