import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude E2E tests - they use Playwright and should be run separately
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/e2e/**'
    ],
    globals: true,
    environment: 'node'
  }
});
