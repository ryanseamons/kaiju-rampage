import { defineConfig } from '@playwright/test';

// Isolated ports so a running `npm run dev` (possibly with a real key) never interferes.
// 8790 mock Anthropic · 8791 narration server WITHOUT key · 8792 narration server WITH (fake) key → mock · 5174 Vite
export default defineConfig({
  testDir: 'tests',
  timeout: 10 * 60_000,
  // Specs are independent (own pages, own localStorage); two at once keeps the gate under the stop hook's 5 minutes.
  workers: 2,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    // A missing element should fail fast, not hang until the 10-minute test timeout.
    actionTimeout: 60_000,
    baseURL: 'http://localhost:5174',
    viewport: { width: 1280, height: 720 },
    // Render with the Mac's GPU (Metal) instead of SwiftShader: ~54 fps instead of ~12 in headless Chromium,
    // so game-driven specs run several times faster and stay well inside the stop hook's 5 minutes.
    launchOptions: {
      args: ['--autoplay-policy=no-user-gesture-required', ...(process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [])],
    },
  },
  webServer: [
    { command: 'node tests/mock-anthropic.mjs', port: 8790, env: { MOCK_PORT: '8790' }, reuseExistingServer: false },
    { command: 'npx tsx server/index.ts', port: 8791, env: { NARRATION_PORT: '8791', ANTHROPIC_API_KEY: '' }, reuseExistingServer: false },
    {
      command: 'npx tsx server/index.ts',
      port: 8792,
      env: { NARRATION_PORT: '8792', ANTHROPIC_API_KEY: 'sk-test-fake', ANTHROPIC_BASE_URL: 'http://localhost:8790' },
      reuseExistingServer: false,
    },
    { command: 'npx vite --port 5174 --strictPort', port: 5174, env: { API_TARGET: 'http://localhost:8791' }, reuseExistingServer: false },
  ],
});
