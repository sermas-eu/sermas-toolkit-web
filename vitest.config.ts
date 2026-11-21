import path from 'node:path';
import { defineConfig } from 'vitest/config';

// @sermas/api-client from its sources: API_CLIENT_DIR, or the checkout beside this one
const apiClientDir = path.resolve(
  process.env.API_CLIENT_DIR || '../sermas-api-client',
);

export default defineConfig({
  resolve: {
    alias: {
      '@sermas/api-client': path.join(apiClientDir, 'src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
  },
});
