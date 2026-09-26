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
    // 개발 서버가 3000을 사용 중이어도 기존 서버와 엉뚱하게 연결되지 않도록
    // E2E 전용 포트를 사용한다. 브라우저 창은 항상 표시하지 않는다.
    baseURL: "http://localhost:3100",
    headless: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
