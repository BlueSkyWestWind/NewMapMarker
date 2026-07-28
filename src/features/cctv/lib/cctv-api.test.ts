import { describe, expect, it } from "vitest";
import type { CctvResponse } from "@/features/cctv/types/cctv";
import { cctvQueryKey, normalizeCctvResponse } from "./cctv-api";

describe("normalizeCctvResponse — 캐시된 구버전 응답 방어", () => {
  it("sampleFields가 없는 이전 응답도 깨지지 않는다", () => {
    // 서버에 필드를 추가하기 전 응답이 브라우저 캐시(10분)에 남아 있는 상황
    const stale = {
      bbox: { minX: 125, maxX: 127.95, minY: 33.85, maxY: 35.5 },
      roadTypes: ["ex"],
      items: [],
      warnings: [],
      notice: "",
      survey: {
        total: 0,
        hasRoadSectionField: false,
        roadSectionFilled: 0,
        roadSectionFilledPercent: 0,
        roadSectionVerdict: "공간매칭필요",
        directionUpDown: 0,
        directionToward: 0,
        directionArrow: 0,
        directionNone: 0,
        directionNonePercent: 0,
        needsManualDirectionUi: false,
        topTowards: [],
        byRoadType: [],
      },
    } as unknown as Partial<CctvResponse>;

    const r = normalizeCctvResponse(stale);
    expect(r.survey.sampleFields).toEqual([]);
    expect(() => r.survey.sampleFields.length).not.toThrow();
  });

  it("survey 자체가 없어도 기본값으로 채운다", () => {
    const r = normalizeCctvResponse({} as Partial<CctvResponse>);

    expect(r.survey.total).toBe(0);
    expect(r.survey.roadSectionVerdict).toBe("판정불가");
    expect(r.survey.sampleFields).toEqual([]);
    expect(r.survey.topTowards).toEqual([]);
    expect(r.survey.byRoadType).toEqual([]);
    expect(r.items).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("배열이 아닌 값이 와도 배열로 만든다", () => {
    const broken = {
      items: null,
      warnings: "문자열",
      survey: { topTowards: undefined, byRoadType: 3 },
    } as unknown as Partial<CctvResponse>;

    const r = normalizeCctvResponse(broken);
    expect(r.items).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.survey.topTowards).toEqual([]);
    expect(r.survey.byRoadType).toEqual([]);
  });

  it("정상 응답은 값을 그대로 보존한다", () => {
    const ok = {
      bbox: { minX: 125, maxX: 127.95, minY: 33.85, maxY: 35.5 },
      roadTypes: ["ex", "its"],
      items: [{ id: "a" }],
      warnings: ["주의"],
      notice: "안내",
      survey: {
        total: 1,
        hasRoadSectionField: true,
        roadSectionFilled: 1,
        roadSectionFilledPercent: 100,
        roadSectionVerdict: "직접사용",
        sampleFields: ["cctvname", "coordx"],
        directionUpDown: 1,
        directionToward: 0,
        directionArrow: 0,
        directionNone: 0,
        directionNonePercent: 0,
        needsManualDirectionUi: false,
        topTowards: [{ word: "순천", count: 1 }],
        byRoadType: [{ code: "ex", label: "고속도로", count: 1 }],
      },
    } as unknown as Partial<CctvResponse>;

    const r = normalizeCctvResponse(ok);
    expect(r.survey.roadSectionVerdict).toBe("직접사용");
    expect(r.survey.sampleFields).toEqual(["cctvname", "coordx"]);
    expect(r.items).toHaveLength(1);
    expect(r.notice).toBe("안내");
  });
});

describe("cctvQueryKey", () => {
  const bbox = { minX: 125, maxX: 127.95, minY: 33.85, maxY: 35.5 };

  it("도로 종별 순서가 달라도 같은 키", () => {
    expect(cctvQueryKey({ bbox, roadTypes: ["its", "ex"] })).toBe(
      cctvQueryKey({ bbox, roadTypes: ["ex", "its"] }),
    );
  });

  it("범위가 다르면 다른 키", () => {
    expect(cctvQueryKey({ bbox, roadTypes: ["ex"] })).not.toBe(
      cctvQueryKey({ bbox: { ...bbox, maxX: 127 }, roadTypes: ["ex"] }),
    );
  });
});
