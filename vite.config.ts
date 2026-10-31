import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base keeps the production build openable from a plain static host
// or the filesystem without rewriting asset URLs.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
