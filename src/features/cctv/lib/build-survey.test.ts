import { describe, expect, it } from "vitest";
import type { CctvItem } from "@/features/cctv/types/cctv";
import { parseCctvDirection } from "./parse-direction";
import { buildCctvSurvey } from "./build-survey";

function cctv(name: string, over: Partial<CctvItem> = {}): CctvItem {
  const { direction, target } = parseCctvDirection(name);
  return {
    id: `id:${name}`,
    name,
    lat: 35.1,
    lng: 126.9,
    roadType: "ex",
    roadSectionId: null,
    direction,
    directionTarget: target,
    streamUrl: null,
    ...over,
  };
}

describe("buildCctvSurvey — 선결 확인 ① roadsectionid", () => {
  it("채움률 95% 이상이면 직접사용", () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      cctv(`c${i}`, { roadSectionId: i < 96 ? `S${i}` : null }),
    );
    const s = buildCctvSurvey(items, true);

    expect(s.roadSectionFilledPercent).toBe(96);
    expect(s.roadSectionVerdict).toBe("직접사용");
  });

  it("50~95%면 부분활용", () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      cctv(`c${i}`, { roadSectionId: i < 70 ? `S${i}` : null }),
    );
    expect(buildCctvSurvey(items, true).roadSectionVerdict).toBe("부분활용");
  });

  it("50% 미만이면 공간매칭필요", () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      cctv(`c${i}`, { roadSectionId: i < 20 ? `S${i}` : null }),
    );
    expect(buildCctvSurvey(items, true).roadSectionVerdict).toBe("공간매칭필요");
  });

  it("필드 자체가 없으면 채움률과 무관하게 공간매칭필요", () => {
    const items = [cctv("a"), cctv("b")];
    const s = buildCctvSurvey(items, false);

    expect(s.hasRoadSectionField).toBe(false);
    expect(s.roadSectionVerdict).toBe("공간매칭필요");
  });

  it("수집 0건이면 판정하지 않는다 — 없는 데이터로 단정하지 않는다", () => {
    // 조회 실패(0건)와 "필드가 없음"이 같은 결론으로 보이면 안 된다
    expect(buildCctvSurvey([], false).roadSectionVerdict).toBe("판정불가");
    expect(buildCctvSurvey([], true).roadSectionVerdict).toBe("판정불가");
  });

  it("실제 응답 필드명을 그대로 전달한다 — 필드명이 다른 경우를 가릴 근거", () => {
    const s = buildCctvSurvey([cctv("a")], false, ["cctvname", "coordx", "coordy"]);
    expect(s.sampleFields).toEqual(["cctvname", "coordx", "coordy"]);
  });

  it("경계값 95% 정확히", () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      cctv(`c${i}`, { roadSectionId: i < 95 ? `S${i}` : null }),
    );
    expect(buildCctvSurvey(items, true).roadSectionVerdict).toBe("직접사용");
  });
});

describe("buildCctvSurvey — 선결 확인 ② 방향 표기", () => {
  it("표기 종류별로 집계한다", () => {
    const s = buildCctvSurvey(
      [
        cctv("담양 상행"),
        cctv("담양 하행"),
        cctv("나주 순천방향"),
        cctv("광산IC ↑"),
        cctv("담양1터널"),
      ],
      true,
    );

    expect(s.directionUpDown).toBe(2);
    expect(s.directionToward).toBe(1);
    expect(s.directionArrow).toBe(1);
    expect(s.directionNone).toBe(1);
    expect(s.directionNonePercent).toBe(20);
  });

  it("방향정보 없음 30% 이상이면 수동 보정 화면이 필요하다", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      cctv(i < 4 ? `터널${i}` : `구간${i} 상행`),
    );
    const s = buildCctvSurvey(items, true);

    expect(s.directionNonePercent).toBe(40);
    expect(s.needsManualDirectionUi).toBe(true);
  });

  it("30% 미만이면 파싱 자동화로 충분", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      cctv(i < 2 ? `터널${i}` : `구간${i} 상행`),
    );
    expect(buildCctvSurvey(items, true).needsManualDirectionUi).toBe(false);
  });

  it("○○방향 상위 표기를 빈도순으로 뽑는다", () => {
    const s = buildCctvSurvey(
      [
        cctv("a 순천방향"),
        cctv("b 순천방향"),
        cctv("c 목포방향"),
      ],
      true,
    );

    expect(s.topTowards[0]).toEqual({ word: "순천", count: 2 });
    expect(s.topTowards[1]).toEqual({ word: "목포", count: 1 });
  });
});

describe("buildCctvSurvey — 도로 종별", () => {
  it("종별 대수를 센다", () => {
    const s = buildCctvSurvey(
      [cctv("a"), cctv("b"), cctv("c", { roadType: "its" })],
      true,
    );

    expect(s.byRoadType).toEqual([
      { code: "ex", label: "고속도로", count: 2 },
      { code: "its", label: "국도", count: 1 },
    ]);
  });

  it("0건인 종별은 표시하지 않는다", () => {
    const s = buildCctvSurvey([cctv("a")], true);
    expect(s.byRoadType.map((t) => t.code)).toEqual(["ex"]);
  });
});

describe("buildCctvSurvey — 빈 결과", () => {
  it("0건이면 나눗셈 오류 없이 0으로 낸다", () => {
    const s = buildCctvSurvey([], true);

    expect(s.total).toBe(0);
    expect(s.roadSectionFilledPercent).toBe(0);
    expect(s.directionNonePercent).toBe(0);
    expect(s.needsManualDirectionUi).toBe(false);
    expect(s.roadSectionVerdict).toBe("판정불가");
  });
});
