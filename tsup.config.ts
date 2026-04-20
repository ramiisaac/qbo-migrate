import { defineConfig } from 'tsup';

// ESM-only CLI. The bin entry (bin/qbo-migrate.mjs) imports dist/index.js
// directly, so we don't need CJS output.
export default defineConfig({
  entry: {
    index: 'src/cli/index.ts',
  },
  outDir: 'dist',
  format: ['esm'],
  splitting: false,
  sourcemap: true,
  dts: {
    entry: 'src/cli/index.ts',
    resolve: true,
  },
  clean: true,
  target: 'node20',
  platform: 'node',
  minify: false,
  treeshake: false,
});
