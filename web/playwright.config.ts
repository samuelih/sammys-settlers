import { defineConfig, devices } from '@playwright/test';

// Playwright E2E config for the Sammys-Settlers web client.
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
  // Specs that play vs bots each consume 3 of the server's 7 robot connections,
  // so concurrent games exhaust the bot pool and games never fill. Run E2E
  // serially against the single shared Java server.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
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
