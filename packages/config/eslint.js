// Shared ESLint flat config for every package. The root eslint.config.mjs
// re-exports it, adding Next.js rules for apps/web.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Root-level config files belong to no package tsconfig.
          allowDefaultProject: ['*.config.ts'],
        },
      },
    },
    rules: {
      // CLAUDE.md: no `any`, no unexplained non-null assertions, log with pino.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-console': 'error',
      // Typed AppError classes only; never throw strings.
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Plain JS config files are not part of any tsconfig.
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Scripts and tests may print to the console.
    files: ['**/scripts/**', '**/*.test.ts', '**/tests/**', '.claude/**'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
