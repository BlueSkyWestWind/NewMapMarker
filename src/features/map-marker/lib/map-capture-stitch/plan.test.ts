import { describe, expect, it } from "vitest";
import { buildCaptureGridPlan, scaleCaptureGridPlan } from "./plan";

describe("buildCaptureGridPlan", () => {
  it("한 타일에 들어가는 작은 영역은 1x1 타일을 만든다", () => {
    // 출처: types.ts CaptureGridPlan·CaptureTilePlan 필드 정의 및 손계산 (totalLat/Lng 0.005 <= span 0.01)
    const plan = buildCaptureGridPlan({
      bounds: {
        sw: { lat: 35.0, lng: 127.0 },
        ne: { lat: 35.005, lng: 127.005 },
      },
      viewportSize: { width: 1000, height: 800 },
      viewportSpan: { latSpan: 0.01, lngSpan: 0.01 },
      overlapRatio: 0,
      paddingRatio: 0,
    });

    expect(plan.rows).toBe(1);
    expect(plan.cols).toBe(1);
    expect(plan.outputWidth).toBe(1000);
    expect(plan.outputHeight).toBe(800);
    expect(plan.tiles).toHaveLength(1);
    expect(plan.tiles[0]).toMatchObject({
      row: 0,
      col: 0,
      destX: 0,
      destY: 0,
      center: { lat: 35.0025, lng: 127.0025 },
    });
  });

  it("가로로 긴 영역은 겹침을 반영한 열 수와 행우선 destX 순서로 타일을 만든다", () => {
    // 출처: types.ts 필드 정의 및 손계산 (overlap=100, stepX=900, effectiveLngSpan=0.009 → cols=3, outputWidth=2800)
    const plan = buildCaptureGridPlan({
      bounds: {
        sw: { lat: 35.0, lng: 127.0 },
        ne: { lat: 35.005, lng: 127.025 },
      },
      viewportSize: { width: 1000, height: 800 },
      viewportSpan: { latSpan: 0.01, lngSpan: 0.01 },
      overlapRatio: 0.1,
      paddingRatio: 0,
    });

    expect(plan.rows).toBe(1);
    expect(plan.cols).toBe(3);
    expect(plan.overlapX).toBe(100);
    expect(plan.outputWidth).toBe(2800);
    expect(plan.outputHeight).toBe(800);
    expect(plan.tiles.map((t) => ({ row: t.row, col: t.col, destX: t.destX, destY: t.destY }))).toEqual([
      { row: 0, col: 0, destX: 0, destY: 0 },
      { row: 0, col: 1, destX: 900, destY: 0 },
      { row: 0, col: 2, destX: 1800, destY: 0 },
    ]);
  });

  it("같은 입력을 두 번 주면 동일한 격자 계획을 반환한다", () => {
    // 출처: 순수 계산 함수의 결정성
    const options = {
      bounds: {
        sw: { lat: 35.1, lng: 126.9 },
        ne: { lat: 35.12, lng: 126.93 },
      },
      viewportSize: { width: 800, height: 600 },
      viewportSpan: { latSpan: 0.01, lngSpan: 0.015 },
    };

    expect(buildCaptureGridPlan(options)).toEqual(buildCaptureGridPlan(options));
  });

  it.todo("0 크기·음수 크기 viewportSize 경계 입력의 동작이 명세되어 있지 않다");
});

describe("scaleCaptureGridPlan", () => {
  it("비율에 따라 타일 크기·겹침·출력 크기·dest 좌표를 반올림해 스케일한다", () => {
    // 출처: plan.ts scaleCaptureGridPlan 주석 ("고해상도 캡처(scale>1)에 맞춰 격자 좌표·크기를 스케일")
    const base = buildCaptureGridPlan({
      bounds: {
        sw: { lat: 35.0, lng: 127.0 },
        ne: { lat: 35.005, lng: 127.025 },
      },
      viewportSize: { width: 1000, height: 800 },
      viewportSpan: { latSpan: 0.01, lngSpan: 0.01 },
      overlapRatio: 0.1,
      paddingRatio: 0,
    });

    const scaled = scaleCaptureGridPlan(base, 2);

    expect(scaled.tileWidth).toBe(2000);
    expect(scaled.tileHeight).toBe(1600);
    expect(scaled.overlapX).toBe(200);
    expect(scaled.outputWidth).toBe(5600);
    expect(scaled.outputHeight).toBe(1600);
    expect(scaled.tiles.map((t) => [t.destX, t.destY])).toEqual([
      [0, 0],
      [1800, 0],
      [3600, 0],
    ]);
  });
});
