import { defineConfig } from 'vitest/config';

export default defineConfig({
  ssr: { external: ['node:sqlite'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
