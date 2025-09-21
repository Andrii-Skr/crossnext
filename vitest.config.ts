import * as path from "node:path";
import { defineConfig } from "vitest/config";

// Avoid import.meta for IDE TS compatibility; use CWD
const projectRoot = path.resolve(process.cwd());

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    coverage: { provider: "v8" },
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
    include: [
      // запускать только наши тесты из каталога tests
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
    ],
    exclude: [
      // исключить e2e тесты Playwright из Vitest прогона
      "tests/e2e/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/.{git,cache,output,temp}/**",
    ],
  },
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
  esbuild: {
    // обеспечить доступность React в JSX без явного импорта
    jsxInject: `import React from 'react'`,
  },
});
