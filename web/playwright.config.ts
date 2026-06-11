import { defineConfig, devices } from '@playwright/test';

// Playwright E2E config for the JSettlers web client.
//
// IMPORTANT: The Java SOCServer must be started SEPARATELY before running
// these E2E tests — Playwright only serves the built web app, not the game
// backend. Start the server with the WebSocket transport and bots, e.g.:
//
//   JAVA_HOME=/opt/homebrew/opt/openjdk@17 \
//     gradle runServer -Djsettlers.websocket.port=8888 -Djsettlers.startrobots=7
//
// The `webServer` block below builds-and-serves the web client via
// `npm run preview` (port 5173). Run `npm run build` first (or rely on the
// preview server failing fast if the dist/ output is missing).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
