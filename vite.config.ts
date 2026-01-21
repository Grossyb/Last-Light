import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  // Base path for GitHub Pages
  base: process.env.NODE_ENV === 'production' ? '/Last-Light/' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
