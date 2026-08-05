import { defineConfig, type UserConfig } from 'tsdown';

// Explicit type annotation: `isolatedDeclarations` cannot infer default exports.
const config: UserConfig = defineConfig({
  entry: ['src/index.ts', 'src/browser.ts', 'src/server.ts', 'src/conformance.ts'],
  format: ['esm'],
  platform: 'neutral',
  target: 'es2023',
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});

export default config;
