import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseUpstreamApi, fetchDirectionsLeg, type UpstreamLegRequest } from "./kakao-route-upstream";

const baseLeg: UpstreamLegRequest = {
  origin: { lat: 35.1, lng: 126.9, name: "출발" },
  destination: { lat: 35.2, lng: 127.0, name: "도착" },
  waypoints: [],
  priority: "RECOMMEND",
  avoidToll: false,
};

function mockFetchOnce(status: number, json: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status,
      json: () => Promise.resolve(json),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chooseUpstreamApi", () => {
  it("중간 경유지 0~5개는 GET", () => {
    expect(chooseUpstreamApi(0)).toBe("GET");
    expect(chooseUpstreamApi(5)).toBe("GET");
  });

  it("중간 경유지 6~30개는 POST", () => {
    expect(chooseUpstreamApi(6)).toBe("POST");
    expect(chooseUpstreamApi(30)).toBe("POST");
  });
});

describe("fetchDirectionsLeg", () => {
  it("result_code 0이면 정규화된 leg를 반환한다", async () => {
    mockFetchOnce(200, {
      routes: [
        {
          result_code: 0,
          summary: { distance: 130_400, duration: 5940, fare: { toll: 5000 } },
          sections: [
            {
              distance: 130_400,
              duration: 5940,
              roads: [{ vertexes: [126.9, 35.1, 127.0, 35.2] }],
            },
          ],
        },
      ],
    });

    const result = await fetchDirectionsLeg(baseLeg, "test-key", "outbound");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.leg.distance).toBe(130_400);
      expect(result.leg.toll).toBe(5000);
      expect(result.leg.path).toEqual([
        { lng: 126.9, lat: 35.1 },
        { lng: 127.0, lat: 35.2 },
      ]);
    }
  });

  it("HTTP 200이어도 result_code != 0이면 실패로 처리한다(§12.1)", async () => {
    mockFetchOnce(200, {
      routes: [{ result_code: 104, result_msg: "출발지와 목적지가 같습니다" }],
    });

    const result = await fetchDirectionsLeg(baseLeg, "test-key", "outbound");

    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.error.code).toBe("SAME_POINT");
  });

  it("102는 출발지 오류, 103은 목적지 오류로 정규화한다", async () => {
    mockFetchOnce(200, { routes: [{ result_code: 102, result_msg: "" }] });
    const originError = await fetchDirectionsLeg(baseLeg, "key", "outbound");
    expect(originError.ok === false && originError.error.code).toBe("ORIGIN_UNREACHABLE");

    mockFetchOnce(200, { routes: [{ result_code: 103, result_msg: "" }] });
    const destError = await fetchDirectionsLeg(baseLeg, "key", "outbound");
    expect(destError.ok === false && destError.error.code).toBe("DEST_UNREACHABLE");
  });

  it("HTTP 429는 RATE_LIMIT으로 정규화한다", async () => {
    mockFetchOnce(429, {});
    const result = await fetchDirectionsLeg(baseLeg, "key", "outbound");
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.error.code).toBe("RATE_LIMIT");
  });

  it("중간 경유지 6개 이상이면 POST waypoints 엔드포인트를 호출한다", async () => {
    mockFetchOnce(200, {
      routes: [{ result_code: 0, summary: { distance: 1, duration: 1 }, sections: [] }],
    });

    await fetchDirectionsLeg(
      { ...baseLeg, waypoints: Array.from({ length: 6 }, () => ({ lat: 35.15, lng: 126.95 })) },
      "key",
      "outbound",
    );

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("/v1/waypoints/directions");
    expect(init.method).toBe("POST");
  });

  it("중간 경유지 5개 이하면 GET directions 엔드포인트를 호출한다", async () => {
    mockFetchOnce(200, {
      routes: [{ result_code: 0, summary: { distance: 1, duration: 1 }, sections: [] }],
    });

    await fetchDirectionsLeg(baseLeg, "key", "outbound");

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("/v1/directions");
    expect(init.method).toBe("GET");
  });
});
