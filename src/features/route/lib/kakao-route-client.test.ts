import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  NormalizedRouteResult,
  RoutePlanRequest,
} from "@/features/route/types/route";
import { planRoute, RouteApiError } from "./kakao-route-client";

const SAMPLE_REQUEST: RoutePlanRequest = {
  origin: { id: "o", name: "출발", lat: 35.1, lng: 126.9 },
  stops: [{ id: "s1", name: "도착", lat: 35.2, lng: 127.0 }],
  roundTrip: false,
  priority: "RECOMMEND",
  avoidToll: false,
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("planRoute", () => {
  it("성공 응답이면 /api/kakao-route POST 요청을 보내고 정규화된 결과를 반환한다", async () => {
    // 출처: kakao-route-client.ts 주석 및 route/types/route.ts NormalizedRouteResult 타입
    const expected: NormalizedRouteResult = {
      totalDistance: 1200,
      totalDuration: 90,
      totalToll: 0,
      legs: [],
    };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(expected), { status: 200 }),
    );

    const result = await planRoute(SAMPLE_REQUEST);

    expect(result).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/kakao-route");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual(SAMPLE_REQUEST);
  });

  it("서버가 RouteErrorPayload를 반환하면 code와 message를 보존한 RouteApiError를 던진다", async () => {
    // 출처: kakao-route-client.ts 주석 ("실패하면 RouteApiError를 던진다") 및 route.test.ts SAME_POINT 코드
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ code: "SAME_POINT", message: "출발지와 도착지가 같습니다." }),
        { status: 422 },
      ),
    );

    await expect(planRoute(SAMPLE_REQUEST)).rejects.toMatchObject({
      name: "Error",
      code: "SAME_POINT",
      message: "출발지와 도착지가 같습니다.",
    });
  });

  it("서버가 비정형 오류 본문을 반환하면 SERVER_ERROR RouteApiError를 던진다", async () => {
    // 출처: kakao-route-client.ts 33-36행 fallback 분기
    fetchMock.mockResolvedValue(new Response("Bad Gateway", { status: 502 }));

    const err = await planRoute(SAMPLE_REQUEST).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RouteApiError);
    expect((err as RouteApiError).code).toBe("SERVER_ERROR");
  });

  it("네트워크 오류(fetch reject)는 그대로 전파된다", async () => {
    // 출처: kakao-route-client.ts (fetch 예외를 별도로 삼키지 않고 전파)
    fetchMock.mockRejectedValue(new TypeError("network down"));

    await expect(planRoute(SAMPLE_REQUEST)).rejects.toThrow("network down");
  });
});
