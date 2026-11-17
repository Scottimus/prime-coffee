import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Integration tests share one Postgres database, so run files sequentially.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
