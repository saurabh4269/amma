import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173', ...devices['Pixel 5'] },
  // Tests run against the production build, served the way a static host would serve it.
  webServer: { command: 'pnpm packs && pnpm build && pnpm preview --port 4173 --strictPort', port: 4173, reuseExistingServer: false, timeout: 120_000 },
});
