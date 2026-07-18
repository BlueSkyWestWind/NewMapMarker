import { test, expect } from "@playwright/test";

/**
 * 앱 스모크 테스트.
 * 지도(Kakao)·DB(Supabase) 연동과 무관하게, 앱 셸(사이드바)이 정상 렌더되는지 확인한다.
 * 대형 파일 분할·훅 추출 등 리팩터링 후에도 첫 화면이 깨지지 않았음을 빠르게 보장한다.
 */
test.describe("앱 스모크", () => {
  test("홈 페이지가 렌더되고 사이드바 모드 탭이 보인다", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // 문서 타이틀
    await expect(page).toHaveTitle(/MapMarker Pro/i);

    // 사이드바 모드 탭(장비/축전지/위치)이 렌더되는지
    await expect(page.getByRole("button", { name: "장비" })).toBeVisible();
    await expect(page.getByRole("button", { name: "축전지" })).toBeVisible();
    await expect(page.getByRole("button", { name: "위치" })).toBeVisible();

    // 치명적 런타임 예외(무한 렌더 등)가 없어야 한다
    expect(errors, `page errors:\n${errors.join("\n")}`).toHaveLength(0);
  });

  test("모드 탭 전환이 동작한다(장비 ↔ 축전지 ↔ 위치)", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

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
