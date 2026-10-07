import { defineConfig } from 'vite';

export default defineConfig({
  // main.js awaits web fonts at top level before drawing billboards
  build: { target: 'es2022' },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true
      }
    }
  }
});
