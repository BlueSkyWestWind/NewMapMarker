import { describe, expect, it } from "vitest";
import { fetchAllowedTile, isAllowedTileHost, TileFetchError } from "./tile-fetch";

const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { Location: location } });

/** 요청 URL을 기록하고 준비한 응답을 순서대로 돌려주는 fetch 대역. */
function fakeFetch(responses: Response[]) {
  const urls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error("준비된 응답이 없습니다.");
    return next;
  }) as unknown as typeof fetch;
  return { fn, urls };
}

describe("isAllowedTileHost", () => {
  it("카카오·다음 계열 호스트만 허용한다", () => {
    expect(isAllowedTileHost("map.daumcdn.net")).toBe(true);
    expect(isAllowedTileHost("t1.kakaocdn.net")).toBe(true);
    expect(isAllowedTileHost("evil.com")).toBe(false);
    expect(isAllowedTileHost("kakao.com.evil.com")).toBe(false);
  });
});

describe("fetchAllowedTile", () => {
  it("리다이렉트 없는 응답은 그대로 돌려준다", async () => {
    const ok = new Response("img", { status: 200 });
    const { fn } = fakeFetch([ok]);
    const response = await fetchAllowedTile(new URL("https://a.daumcdn.net/t.png"), fn);
    expect(response).toBe(ok);
  });

  it("허용 호스트로의 리다이렉트는 따라간다", async () => {
    const ok = new Response("img", { status: 200 });
    const { fn, urls } = fakeFetch([redirect("https://b.kakaocdn.net/t.png"), ok]);
    const response = await fetchAllowedTile(new URL("https://a.daumcdn.net/t.png"), fn);
    expect(response).toBe(ok);
    expect(urls).toEqual(["https://a.daumcdn.net/t.png", "https://b.kakaocdn.net/t.png"]);
  });

  it("허용되지 않은 호스트로의 리다이렉트는 따라가지 않고 오류를 던진다", async () => {
    const { fn, urls } = fakeFetch([redirect("http://169.254.169.254/latest/meta-data")]);
    await expect(
      fetchAllowedTile(new URL("https://a.kakao.com/x"), fn),
    ).rejects.toBeInstanceOf(TileFetchError);
    expect(urls).toHaveLength(1);
  });

  it("상대 경로 Location도 원래 호스트 기준으로 풀어 검사한다", async () => {
    const ok = new Response("img", { status: 200 });
    const { fn, urls } = fakeFetch([redirect("/other.png"), ok]);
    await fetchAllowedTile(new URL("https://a.daumcdn.net/t.png"), fn);
    expect(urls[1]).toBe("https://a.daumcdn.net/other.png");
  });

  it("리다이렉트가 maxHops를 넘으면 오류를 던진다", async () => {
    const { fn } = fakeFetch(
      Array.from({ length: 5 }, () => redirect("https://a.daumcdn.net/next")),
    );
    await expect(
      fetchAllowedTile(new URL("https://a.daumcdn.net/t.png"), fn, 3),
    ).rejects.toBeInstanceOf(TileFetchError);
  });
});
