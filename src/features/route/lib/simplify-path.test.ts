import { describe, expect, it } from "vitest";
import { douglasPeucker, maybeSimplifyPath } from "./simplify-path";
import type { RouteCoordinate } from "@/features/route/types/route";

describe("douglasPeucker", () => {
  it("시작/끝 좌표를 보존한다", () => {
    const path: RouteCoordinate[] = [
      { lat: 0, lng: 0 },
      { lat: 0.0001, lng: 1 },
      { lat: -0.0001, lng: 2 },
      { lat: 0, lng: 3 },
    ];
    const simplified = douglasPeucker(path, 0.01);
    expect(simplified[0]).toEqual(path[0]);
    expect(simplified[simplified.length - 1]).toEqual(path[path.length - 1]);
  });

  it("허용 오차 이내의 굴곡은 정점을 줄인다", () => {
    const path: RouteCoordinate[] = [
      { lat: 0, lng: 0 },
      { lat: 0.00001, lng: 1 },
      { lat: 0, lng: 2 },
    ];
    const simplified = douglasPeucker(path, 0.01);
    expect(simplified.length).toBeLessThan(path.length);
  });

  it("점이 2개 이하면 그대로 반환한다", () => {
    const path: RouteCoordinate[] = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }];
    expect(douglasPeucker(path, 0.01)).toEqual(path);
  });
});

describe("maybeSimplifyPath", () => {
  it("임계치 이하 경로는 원본 그대로 반환한다", () => {
    const path: RouteCoordinate[] = Array.from({ length: 10 }, (_, i) => ({
      lat: i * 0.001,
      lng: i * 0.001,
    }));
    expect(maybeSimplifyPath(path, 5000)).toBe(path);
  });

  it("임계치를 넘으면 단순화하되 시작/끝은 유지한다", () => {
    const path: RouteCoordinate[] = Array.from({ length: 20 }, (_, i) => ({
      lat: i * 0.0001,
      lng: i * 0.0001,
    }));
    const simplified = maybeSimplifyPath(path, 5, 0.0001);
    expect(simplified.length).toBeLessThan(path.length);
    expect(simplified[0]).toEqual(path[0]);
    expect(simplified[simplified.length - 1]).toEqual(path[path.length - 1]);
  });
});
