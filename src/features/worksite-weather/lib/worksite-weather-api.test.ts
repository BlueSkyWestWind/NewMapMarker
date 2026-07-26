import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteMatch } from "@/features/worksite-weather/types/weather";
import {
  buildWorksiteWeatherQuery,
  clearWorksiteWeatherCache,
  fetchWorksiteWeather,
  worksiteWeatherKey,
} from "./worksite-weather-api";

function site(over: Partial<SiteMatch> = {}): SiteMatch {
  return {
    id: "b1",
    name: "조례국소",
    address: "전라남도 순천시 조례동 123-4",
    lat: 34.9506,
    lng: 127.4872,
    workType: "ground",
    matchedBy: "name",
    ...over,
  };
}

const okBody = JSON.stringify({ overall: "safe", timeline: [] });

function mockFetch(body: string, status = 200, delayMs = 0) {
  return vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        const respond = () =>
          resolve({
            ok: status >= 200 && status < 300,
            status,
            text: () => Promise.resolve(body),
          } as Response);
        if (delayMs > 0) setTimeout(respond, delayMs);
        else respond();
      }),
  );
}

beforeEach(() => {
  clearWorksiteWeatherCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildWorksiteWeatherQuery", () => {
  it("좌표·작업형태·지역을 담는다", () => {
    const q = new URLSearchParams(buildWorksiteWeatherQuery(site({ workType: "elevated" })));
    expect(q.get("lat")).toBe("34.9506");
    expect(q.get("lng")).toBe("127.4872");
    expect(q.get("workType")).toBe("elevated");
    expect(q.get("region")).toBe("전라남도 순천시 조례동 123-4".slice(0, 20));
  });

  it("주소가 없으면 region을 붙이지 않는다", () => {
    expect(buildWorksiteWeatherQuery(site({ address: "" }))).not.toContain("region");
  });

  it("좌표가 같으면 캐시 키도 같다", () => {
    expect(worksiteWeatherKey(site({ id: "다른id" }))).toBe(worksiteWeatherKey(site()));
  });
});

describe("fetchWorksiteWeather — 캐시·중복제거", () => {
  it("같은 국소를 여러 번 열어도 요청은 한 번만 나간다", async () => {
    const f = mockFetch(okBody);
    vi.stubGlobal("fetch", f);

    await fetchWorksiteWeather(site());
    await fetchWorksiteWeather(site());
    await fetchWorksiteWeather(site());

    expect(f).toHaveBeenCalledTimes(1);
  });

  it("동시 호출도 하나로 합친다 (지도에서 연속 클릭)", async () => {
    const f = mockFetch(okBody, 200, 10);
    vi.stubGlobal("fetch", f);

    await Promise.all([
      fetchWorksiteWeather(site()),
      fetchWorksiteWeather(site()),
      fetchWorksiteWeather(site()),
    ]);

    expect(f).toHaveBeenCalledTimes(1);
  });

  it("국소가 다르면 따로 요청한다", async () => {
    const f = mockFetch(okBody);
    vi.stubGlobal("fetch", f);

    await fetchWorksiteWeather(site());
    await fetchWorksiteWeather(site({ lat: 35.1595, lng: 126.8526 }));

    expect(f).toHaveBeenCalledTimes(2);
  });

  it("실패는 캐시하지 않는다 — 재시도가 가능해야 한다", async () => {
    const f = mockFetch(JSON.stringify({ error: "기상청 인증키 오류" }), 502);
    vi.stubGlobal("fetch", f);

    await expect(fetchWorksiteWeather(site())).rejects.toThrow("기상청 인증키 오류");
    await expect(fetchWorksiteWeather(site())).rejects.toThrow();

    expect(f).toHaveBeenCalledTimes(2);
  });

  it("평문 500 응답을 JSON 파싱 오류 대신 안내 문구로 바꾼다", async () => {
    vi.stubGlobal("fetch", mockFetch("Internal Server Error", 500));

    await expect(fetchWorksiteWeather(site())).rejects.toThrow(/서버 응답 500/);
    await expect(fetchWorksiteWeather(site())).rejects.not.toThrow(/Unexpected token/);
  });
});
