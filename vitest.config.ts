import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: [
        // ブラウザの DOM と実プロセスに強く依存する層。ここは e2e で見る領域で、
        // 行カバレッジで縛ると意味の薄いテストを増やすことになる。
        'apps/web/src/main.tsx',
        'apps/web/src/App.tsx',
        'apps/web/src/components/**',
        'apps/server/src/index.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
