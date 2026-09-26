import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const ORIGIN = { id: "o", name: "출발", lat: 35.1, lng: 126.9 };

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://newmarker.example.com/api/kakao-route", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function stubDirectionsFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status: 200,
      json: () =>
        Promise.resolve({
          routes: [
            {
              result_code: 0,
              summary: { distance: 1000, duration: 60, fare: { toll: 0 } },
              sections: [{ distance: 1000, duration: 60, roads: [{ vertexes: [126.9, 35.1, 127.0, 35.2] }] }],
            },
          ],
        }),
    }),
  );
}

beforeEach(() => {
  process.env.KAKAO_REST_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.KAKAO_REST_API_KEY;
});

describe("POST /api/kakao-route — 입력 검증", () => {
  it("stops가 31개를 넘으면 거부한다", async () => {
    const stops = Array.from({ length: 32 }, (_, i) => ({
      id: `s${i}`,
      name: `s${i}`,
      lat: 35.1 + i * 0.001,
      lng: 126.9,
    }));
    const response = await POST(
      makeRequest({ origin: ORIGIN, stops, roundTrip: false, priority: "RECOMMEND", avoidToll: false }),
    );
    expect(response.status).toBe(400);
  });

  it("좌표 범위를 벗어나면 거부한다", async () => {
    const response = await POST(
      makeRequest({
        origin: ORIGIN,
        stops: [{ id: "s", name: "s", lat: 999, lng: 126.9 }],
        roundTrip: false,
        priority: "RECOMMEND",
        avoidToll: false,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("잘못된 priority enum은 거부한다", async () => {
    const response = await POST(
      makeRequest({
        origin: ORIGIN,
        stops: [{ id: "s", name: "s", lat: 35.2, lng: 127.0 }],
        roundTrip: false,
        priority: "FASTEST",
        avoidToll: false,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("타 Origin 요청은 403으로 차단한다", async () => {
    const request = new NextRequest("https://newmarker.example.com/api/kakao-route", {
      method: "POST",
      body: JSON.stringify({
        origin: ORIGIN,
        stops: [{ id: "s", name: "s", lat: 35.2, lng: 127.0 }],
        roundTrip: false,
        priority: "RECOMMEND",
        avoidToll: false,
      }),
      headers: { origin: "https://evil.example.org" },
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("REST API 키가 없으면 500을 반환하되 응답에 키가 노출되지 않는다", async () => {
    delete process.env.KAKAO_REST_API_KEY;
    const response = await POST(
      makeRequest({
        origin: ORIGIN,
        stops: [{ id: "s", name: "s", lat: 35.2, lng: 127.0 }],
        roundTrip: false,
        priority: "RECOMMEND",
        avoidToll: false,
      }),
    );
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(JSON.stringify(json)).not.toContain("test-key");
  });
});

describe("POST /api/kakao-route — 편도/왕복", () => {
  it("편도는 upstream을 1회 호출하고 leg 1개를 반환한다", async () => {
    stubDirectionsFetch();
    const response = await POST(
      makeRequest({
        origin: { ...ORIGIN, lat: 10.1, lng: 20.1 },
        stops: [{ id: "s", name: "s", lat: 10.2, lng: 20.2 }],
        roundTrip: false,
        priority: "RECOMMEND",
        avoidToll: false,
      }),
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.legs).toHaveLength(1);
    expect(json.legs[0].type).toBe("outbound");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("왕복은 outbound+return 2회 호출하고 origin==destination으로 보내지 않는다", async () => {
    stubDirectionsFetch();
    const response = await POST(
      makeRequest({
        origin: { ...ORIGIN, lat: 10.3, lng: 20.3 },
        stops: [{ id: "s", name: "s", lat: 10.4, lng: 20.4 }],
        roundTrip: true,
        priority: "RECOMMEND",
        avoidToll: false,
      }),
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.legs).toHaveLength(2);
    expect(json.legs.map((leg: { type: string }) => leg.type)).toEqual(["outbound", "return"]);
    expect(fetch).toHaveBeenCalledTimes(2);

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    calls.forEach(([url]) => {
      const parsed = new URL(String(url));
      const origin = parsed.searchParams.get("origin");
      const destination = parsed.searchParams.get("destination");
      if (origin && destination) expect(origin).not.toBe(destination);
    });
  });

  it("총계는 leg 합산값과 일치한다", async () => {
    stubDirectionsFetch();
    const response = await POST(
      makeRequest({
        origin: { ...ORIGIN, lat: 10.5, lng: 20.5 },
        stops: [{ id: "s", name: "s", lat: 10.6, lng: 20.6 }],
        roundTrip: true,
        priority: "RECOMMEND",
        avoidToll: false,
      }),
    );
    const json = await response.json();
    const sum = (key: "distance" | "duration" | "toll") =>
      json.legs.reduce((acc: number, leg: Record<string, number>) => acc + leg[key], 0);
    expect(json.totalDistance).toBe(sum("distance"));
    expect(json.totalDuration).toBe(sum("duration"));
    expect(json.totalToll).toBe(sum("toll"));
  });
});

describe("POST /api/kakao-route — 캐시", () => {
  it("동일 요청 2회는 upstream을 1회만 호출한다", async () => {
    stubDirectionsFetch();
    const body = {
      origin: { ...ORIGIN, lat: 11.1, lng: 21.1 },
      stops: [{ id: "s", name: "s", lat: 11.2, lng: 21.2 }],
      roundTrip: false,
      priority: "RECOMMEND",
      avoidToll: false,
    };

    await POST(makeRequest(body));
    await POST(makeRequest(body));

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("순서가 바뀌면 cache miss로 upstream을 다시 호출한다", async () => {
    stubDirectionsFetch();
    const stopA = { id: "a", name: "a", lat: 11.3, lng: 21.3 };
    const stopB = { id: "b", name: "b", lat: 11.4, lng: 21.4 };
    const origin = { ...ORIGIN, lat: 11.5, lng: 21.5 };

    await POST(makeRequest({ origin, stops: [stopA, stopB], roundTrip: false, priority: "RECOMMEND", avoidToll: false }));
    await POST(makeRequest({ origin, stops: [stopB, stopA], roundTrip: false, priority: "RECOMMEND", avoidToll: false }));

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/kakao-route — 오류", () => {
  it("result_code 104는 422 SAME_POINT로 정규화한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ routes: [{ result_code: 104, result_msg: "same" }] }),
      }),
    );

    const response = await POST(
      makeRequest({
        origin: { ...ORIGIN, lat: 12.1, lng: 22.1 },
        stops: [{ id: "s", name: "s", lat: 12.2, lng: 22.2 }],
        roundTrip: false,
        priority: "RECOMMEND",
        avoidToll: false,
      }),
    );

    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.code).toBe("SAME_POINT");
  });

  it("실패 응답은 캐시에 저장하지 않는다(재요청 시 다시 호출)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve({ routes: [{ result_code: 999, result_msg: "fail" }] }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: () =>
          Promise.resolve({
            routes: [{ result_code: 0, summary: { distance: 1, duration: 1 }, sections: [] }],
          }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const body = {
      origin: { ...ORIGIN, lat: 12.3, lng: 22.3 },
      stops: [{ id: "s", name: "s", lat: 12.4, lng: 22.4 }],
      roundTrip: false,
      priority: "RECOMMEND",
      avoidToll: false,
    };

    const first = await POST(makeRequest(body));
    expect(first.status).toBe(422);

    const second = await POST(makeRequest(body));
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
