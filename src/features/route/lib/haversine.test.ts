import { describe, expect, it } from "vitest";
import {
  buildDistanceMatrix,
  estimateRoadDistance,
  haversineDistance,
  mergeDuplicateStops,
} from "./haversine";
import type { RoutePoint } from "@/features/route/types/route";

const SEOUL = { lat: 37.5665, lng: 126.978 };
const BUSAN = { lat: 35.1796, lng: 129.0756 };

describe("haversineDistance", () => {
  it("동일 좌표는 0", () => {
    expect(haversineDistance(SEOUL, SEOUL)).toBe(0);
  });

  it("서울-부산 거리는 약 325km 오차범위 내", () => {
    const distance = haversineDistance(SEOUL, BUSAN);
    expect(distance).toBeGreaterThan(300_000);
    expect(distance).toBeLessThan(350_000);
  });

  it("대칭성: A→B == B→A", () => {
    expect(haversineDistance(SEOUL, BUSAN)).toBe(haversineDistance(BUSAN, SEOUL));
  });
});

describe("buildDistanceMatrix", () => {
  it("대칭 행렬을 만든다", () => {
    const matrix = buildDistanceMatrix([SEOUL, BUSAN]);
    expect(matrix[0][0]).toBe(0);
    expect(matrix[0][1]).toBe(matrix[1][0]);
  });
});

describe("mergeDuplicateStops", () => {
  const makePoint = (id: string, lat: number, lng: number, name = id): RoutePoint => ({
    routePointId: id,
    markerIds: [id],
    name,
    lat,
    lng,
  });

  it("20m 이내 지점을 하나로 병합하고 markerIds를 모두 보존한다", () => {
    const a = makePoint("a", 35.1, 126.9, "A국소");
    // a에서 약 5m 떨어진 지점
    const b = makePoint("b", 35.10004, 126.9, "B국소");
    const c = makePoint("c", 35.2, 127.0, "C국소");

    const merged = mergeDuplicateStops([a, b, c]);

    expect(merged).toHaveLength(2);
    const mergedGroup = merged.find((p) => p.markerIds.length === 2);
    expect(mergedGroup).toBeDefined();
    expect(mergedGroup?.markerIds).toEqual(["a", "b"]);
  });

  it("20m 밖이면 병합하지 않는다", () => {
    const a = makePoint("a", 35.1, 126.9);
    const b = makePoint("b", 35.101, 126.9);
    expect(mergeDuplicateStops([a, b])).toHaveLength(2);
  });
});

describe("estimateRoadDistance", () => {
  it("직선거리 합 × 1.3을 반환한다", () => {
    const raw = haversineDistance(SEOUL, BUSAN);
    expect(estimateRoadDistance([SEOUL, BUSAN])).toBeCloseTo(raw * 1.3, 3);
  });
});
