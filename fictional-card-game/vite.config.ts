import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 100000,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  server: { host: true, port: 5180 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
} as any);
