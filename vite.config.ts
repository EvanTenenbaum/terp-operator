import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    sourcemap: process.env.BUILD_SOURCEMAP === 'true',
    chunkSizeWarningLimit: 3500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('ag-grid')) return 'grid';
          return undefined;
        }
      }
    }
  },
  server: {
    port: 5173,
    // GH #331: explicitly restrict allowed hosts instead of allowedHosts: true.
    // 'localhost' and '127.0.0.1' cover the normal local dev workflow.
    // The Tailscale host pattern covers Mac mini access over the Tailscale
    // network (e.g. 100.x.x.x or *.tailscale.ts.net). If you need broader
    // access in a specific dev environment, set allowedHosts: 'all' in a
    // local vite.config.local.ts (never commit that). Never use allowedHosts: true
    // in committed config — it silently disables the Host header check.
    allowedHosts: ['localhost', '127.0.0.1', '.tailscale.ts.net'],
    proxy: {
      '/trpc': 'http://localhost:8787',
      '/api': 'http://localhost:8787',
      '/socket.io': {
        target: 'http://localhost:8787',
        ws: true
      }
    }
  }
});
