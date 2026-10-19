import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  workers: 3,
  use: {
    baseURL: "http://127.0.0.1:4287",
    headless: true,
    serviceWorkers: "block",
  },
  webServer: [
    {
      command: "node scripts/serve.mjs",
      url: "http://127.0.0.1:4287",
      reuseExistingServer: false,
    },
    {
      command: "node scripts/serve.mjs",
      env: { PORT: "4288", BASE_PATH: "/eazyread" },
      url: "http://127.0.0.1:4288/eazyread/",
      reuseExistingServer: false,
    },
  ],
  reporter: "list",
});
