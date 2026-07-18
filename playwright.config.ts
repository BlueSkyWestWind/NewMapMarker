import { defineConfig, devices } from "@playwright/test";

/**
 * E2E 스모크 설정. 로컬 dev 서버(localhost:3000)를 대상으로 한다.
 * 이미 dev 서버가 떠 있으면 재사용하고, 없으면 자동 기동한다.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
