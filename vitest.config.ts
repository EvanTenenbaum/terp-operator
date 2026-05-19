import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/e2e/**'
    ],
    globals: true,
    environment: 'node',
    // Integration tests share a single Postgres database; running multiple
    // test files in parallel causes races on global tables like
    // `credit_recompute_queue` and `customers`. Disable file parallelism so
    // each file owns the DB while it runs. (Tests within a file remain
    // sequential by default.)
    fileParallelism: false,
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
