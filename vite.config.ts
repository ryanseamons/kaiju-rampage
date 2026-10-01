import { defineConfig } from 'vite';

// The browser only ever talks to /api on its own origin. Vite forwards it to the
// local narration server, which is the only process that sees ANTHROPIC_API_KEY.
const apiTarget = process.env.API_TARGET ?? `http://localhost:${process.env.NARRATION_PORT ?? 8787}`;

export default defineConfig({
  // Relative asset URLs: the build runs at a site root (Cloudflare) and under Voyage Labs' game path.
  base: './',
  server: {
    // VITE_PORT, else a launcher-assigned PORT (the narration server uses NARRATION_PORT, so no clash).
    port: Number(process.env.VITE_PORT ?? process.env.PORT ?? 5173),
    strictPort: true,
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  build: { chunkSizeWarningLimit: 2000 },
});
