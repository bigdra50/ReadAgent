import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'pdf',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
