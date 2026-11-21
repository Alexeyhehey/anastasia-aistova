import { defineConfig } from '@playwright/test';

const publishedURL = process.env.PORTFOLIO_URL;
const localURL = 'http://127.0.0.1:4173/';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  use: { baseURL: publishedURL || localURL },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: publishedURL ? undefined : {
    command: 'npx --no-install vite --host 127.0.0.1 --port 4173 --strictPort',
    url: localURL,
    reuseExistingServer: !process.env.CI,
  },
});
