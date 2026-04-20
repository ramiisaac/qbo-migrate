// Flat ESLint config for ESM + TypeScript with Prettier compatibility.
// Type-aware linting is enabled via tsconfig.eslint.json, which has a broader
// `include` than tsconfig.json (covers scripts/, tests/, and root config files).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules', 'dist', 'coverage', '*.tgz', 'bin/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Project preferences
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // TypeScript-ESLint adjustments
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      // Type-aware rules that catch real bugs in async/QBO code paths
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // The logger abstraction is the one legitimate place `console.*` is used;
    // everywhere else should go through `logger.*`.
    files: ['src/utils/log.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Tests spy on `console.log` to verify logger output.
    files: ['tests/utils/log.test.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      // Tests intentionally construct promises without awaiting to assert rejection shape,
      // and pass async callbacks into APIs that only expect sync callbacks (stub providers).
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
  eslintConfigPrettier,
];
