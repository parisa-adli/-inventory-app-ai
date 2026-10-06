import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false,
  deps: {
    // @inventory/shared is raw TypeScript, so it must be bundled into the output.
    // Every other dependency stays external and is installed at runtime.
    alwaysBundle: [/^@inventory\/shared/],
  },
})
