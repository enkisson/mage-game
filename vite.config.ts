import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the build runs from any folder or host.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
