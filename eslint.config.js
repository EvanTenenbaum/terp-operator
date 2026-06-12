import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: './tsconfig.json' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      // Start with warn not error — existing codebase has violations
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      // EXT-REVIEW 2026-06 finding #6: device-locale formatting produced
      // mixed-language UI on non-US devices. All user-visible formatting is
      // pinned to en-US (see src/client/utils/format.ts APP_LOCALE). Bare
      // toLocale*() calls (no locale arg) silently use the device locale.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/][arguments.length=0]",
          message: 'Pass an explicit locale (use formatDate/formatDateTime/formatNumber/formatMoney from utils/format, or APP_LOCALE).',
        },
        {
          selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/] > Identifier.arguments:first-child[name='undefined']",
          message: 'Do not pass undefined locale — use APP_LOCALE from utils/format.',
        },
      ],
    },
  },
];
