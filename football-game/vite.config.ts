import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist', chunkSizeWarningLimit: 4000, cssCodeSplit: false, assetsInlineLimit: 100000,
    rollupOptions: { output: { inlineDynamicImports: true } } },
  server: { host: true, port: 5174 },
});
