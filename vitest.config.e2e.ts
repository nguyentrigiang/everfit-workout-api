import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.e2e-spec.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://everfit:everfit@localhost:5432/everfit_test',
      LOG_LEVEL: 'silent',
    },
  },
});
