import { defineConfig } from 'vite';

// The browser only ever talks to /api on its own origin. Vite forwards it to the
// local narration server, which is the only process that sees ANTHROPIC_API_KEY.
const apiTarget = process.env.API_TARGET ?? 'http://localhost:8787';

export default defineConfig({
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    strictPort: true,
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  build: { chunkSizeWarningLimit: 2000 },
});
