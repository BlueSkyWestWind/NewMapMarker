import { test, expect, type Page } from "@playwright/test";

/**
 * 앱 스모크 테스트.
 * 지도(Kakao)·DB(Supabase) 연동과 무관하게, 로그인 벽과 앱 셸(사이드바)이 정상 렌더되는지 확인한다.
 *
 * 앱 전체가 로그인 벽(AuthGate) 안에 있어, 셸을 확인하는 테스트는 로그인 계정이 필요하다.
 * `E2E_EMAIL`·`E2E_PASSWORD`가 없으면 그 테스트는 건너뛴다(비로그인 테스트는 항상 실행).
 */
const E2E_EMAIL = process.env.E2E_EMAIL;
const E2E_PASSWORD = process.env.E2E_PASSWORD;

async function login(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "로그인" }).click();
  await page.getByLabel("이메일").fill(E2E_EMAIL ?? "");
  await page.getByLabel("비밀번호").fill(E2E_PASSWORD ?? "");
  await page.getByRole("dialog").getByRole("button", { name: "로그인" }).click();
}

test.describe("로그인 벽", () => {
  test("비로그인이면 로그인 카드만 보이고 앱 셸·카카오 SDK는 없다", async ({ page }) => {
    const errors: string[] = [];
    const kakaoRequests: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("request", (r) => {
      if (r.url().includes("dapi.kakao.com")) kakaoRequests.push(r.url());
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveTitle(/MapMarker Pro/i);
    await expect(page.getByRole("heading", { name: "로그인이 필요합니다" })).toBeVisible();
    await expect(page.getByRole("button", { name: "장비" })).toHaveCount(0);

    expect(kakaoRequests, "비로그인에서 카카오 SDK를 불러오면 안 된다").toHaveLength(0);
    expect(errors, `page errors:\n${errors.join("\n")}`).toHaveLength(0);
  });

  test("비로그인 상태의 토큰 없는 API 호출은 401", async ({ request }) => {
    const response = await request.get("/api/its-key");
    expect(response.status()).toBe(401);
  });
});

test.describe("앱 스모크 (로그인 필요)", () => {
  test.skip(!E2E_EMAIL || !E2E_PASSWORD, "E2E_EMAIL / E2E_PASSWORD 가 없어 건너뜀");

  test("홈 페이지가 렌더되고 사이드바 모드 탭이 보인다", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await login(page);

    await expect(page.getByRole("button", { name: "장비" })).toBeVisible();
    await expect(page.getByRole("button", { name: "축전지" })).toBeVisible();
    await expect(page.getByRole("button", { name: "위치" })).toBeVisible();

    // 치명적 런타임 예외(무한 렌더 등)가 없어야 한다
    expect(errors, `page errors:\n${errors.join("\n")}`).toHaveLength(0);
  });

  test("모드 탭 전환이 동작한다(장비 ↔ 축전지 ↔ 위치)", async ({ page }) => {
    await login(page);

    const battery = page.getByRole("button", { name: "축전지" });
    await battery.click();
    await expect(page.getByRole("button", { name: "장비" })).toBeVisible();
    await expect(battery).toBeVisible();

    const location = page.getByRole("button", { name: "위치" });
    await location.click();
    await expect(
      page.getByText(/지도를 클릭하면 위치가 바로 등록됩니다/),
    ).toBeVisible();
    await expect(location).toBeVisible();
  });
});
