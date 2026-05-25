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
    // Allow the fast runner (DigitalOcean Tailscale) to reach the dev server.
    // Vite 6 DNS rebinding protection blocks cross-host requests by default.
    allowedHosts: true,
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
