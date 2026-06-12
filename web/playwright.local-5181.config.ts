// Temporary local config: same as playwright.config.ts but serves THIS
// checkout's build on port 5181 (5173 may be held by another working tree).
import baseConfig from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...baseConfig,
  use: {
    ...baseConfig.use,
    baseURL: 'http://localhost:5181',
  },
  webServer: {
    command: 'npm run preview -- --port 5181 --strictPort',
    url: 'http://localhost:5181',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
