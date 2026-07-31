import { defineConfig, type ViteUserConfig } from 'vitest/config';

// Explicit type annotation: `isolatedDeclarations` cannot infer default exports.
const config: ViteUserConfig = defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test-d.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80,
      },
    },
  },
});

export default config;
