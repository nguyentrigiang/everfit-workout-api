import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Shared with test/global-setup.ts (migrations) and the test workers (app config).
process.env.TEST_DATABASE_URL ??=
  'postgresql://everfit:everfit@localhost:5432/everfit_test';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    setupFiles: ['./test/setup.ts'],
    globalSetup: ['./test/global-setup.ts'],
    include: ['**/*.e2e-spec.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      LOG_LEVEL: 'silent',
    },
  },
});
