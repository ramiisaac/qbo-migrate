import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov', 'html'],
      exclude: [
        'coverage/**',
        'dist/**',
        '*.config.ts',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'bin/**',
      ],
    },
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
    },
  },
});
