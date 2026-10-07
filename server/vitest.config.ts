import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // The server reuses the app's tested business rules; see tsconfig.json for the matching path.
    alias: { '@domain': fileURLToPath(new URL('../src/domain', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Each file builds its own database from the shared template, so files can run side by side.
    fileParallelism: true,
  },
});
