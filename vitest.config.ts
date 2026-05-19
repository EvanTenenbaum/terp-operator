import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'src/client/components/RecordPrepaymentDialog.tsx',
        'src/client/components/RefereeDialog.tsx',
        'src/client/components/UpdateRefereeRelationshipDialog.tsx',
        'src/client/components/DeactivateRefereeRelationshipDialog.tsx',
        'src/client/components/VoidRefereeCreditDialog.tsx',
        'src/client/components/RefereeRelationshipsList.tsx',
        'src/client/components/RefereeCreditsList.tsx',
        'src/client/components/RefereeDetailPanel.tsx',
        'src/client/components/ProcessorFeesGrid.tsx',
        'src/client/components/ProcessorDetailPanel.tsx',
        'src/server/services/refereeCredits.test.ts'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    }
  }
});
