import { describe, expect, it } from "vitest";
import {
  getColorDisplayName,
  resolveColorToHex,
} from "@/features/map-marker/constants/facility-teams";
import {
  getEffectiveMarkerColor,
  getMarkerColorLabel,
  getMarkerSvg,
} from "@/features/map-marker/lib/marker-svg";
import type {
  EquipmentMarker,
  FacilityStatus,
} from "@/features/map-marker/types/marker";

const decodeSvg = (uri: string) =>
  decodeURIComponent(uri.replace("data:image/svg+xml;utf8,", ""));

function equipment(
  facilityStatus: FacilityStatus | undefined,
  overrides: Partial<EquipmentMarker> = {},
) {
  return {
    id: "m1",
    name: "국소",
    lat: 37.5,
    lng: 127,
    memo: "",
    tags: [],
    color: "#6366f1",
    facilityTeam: "",
    createdAt: "2026-01-01",
    facilityStatus,
    ...overrides,
  } as EquipmentMarker;
}

describe("getMarkerColorLabel", () => {
  it("장비 모드에서는 팀 색상과 겹치는 hex라도 범용 색상명을 쓴다", () => {
    // #84cc16(라임)은 장비 색상 팔레트와 축전지 3팀 색상이 우연히 같다.
    expect(getMarkerColorLabel("#84cc16", "equipment")).toBe("라임");
  });

  it("축전지 모드에서는 팀 색상 hex를 담당팀 이름으로 표시한다", () => {
    expect(getMarkerColorLabel("#84cc16", "battery")).toBe("3팀(정종연)");
  });

  it("팀 색상이 아닌 hex는 축전지 모드에서도 범용 색상명을 쓴다", () => {
    expect(getMarkerColorLabel("#10b981", "battery")).toBe("에메랄드");
  });
});

describe("getEffectiveMarkerColor 장비 시설 상태색", () => {
  it.each([
    ["미시설", "#10b981"],
    ["시설", "#64748b"],
    ["개통완료", "#ffffff"],
  ] as const)("%s는 상태색 %s를 쓴다", (status, color) => {
    expect(getEffectiveMarkerColor(equipment(status), "equipment")).toBe(color);
  });

  it("올해 대상 없음·상태 없음은 저장된 색을 쓴다", () => {
    expect(getEffectiveMarkerColor(equipment("올해 대상 없음"), "equipment")).toBe("#6366f1");
    expect(getEffectiveMarkerColor(equipment(undefined), "equipment")).toBe("#6366f1");
  });

  it("대기 마커와 임시 마커는 상태색을 쓰지 않는다", () => {
    expect(
      getEffectiveMarkerColor(equipment("개통완료", { isPending: true }), "equipment"),
    ).toBe("#6366f1");
    expect(
      getEffectiveMarkerColor(equipment("개통완료", { isTemp: true }), "equipment"),
    ).toBe("#ef4444");
  });

  it("장비 모드가 아니면 상태색을 쓰지 않는다", () => {
    expect(getEffectiveMarkerColor(equipment("개통완료"), "location")).toBe("#6366f1");
  });
});

describe("getMarkerSvg 흰 핀", () => {
  it("흰 핀은 어두운 테두리와 안쪽 점을 써서 배경에 묻히지 않는다", () => {
    const svg = decodeSvg(getMarkerSvg("#ffffff"));
    expect(svg).toContain('stroke="#475569"');
    expect(svg).toContain('fill="#475569"');
  });

  it("다른 색 핀은 기존처럼 흰 테두리·흰 점이다", () => {
    const svg = decodeSvg(getMarkerSvg("#10b981"));
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).toContain('fill="#ffffff"');
  });
});

describe("추가 마커 색상 5개", () => {
  it.each([
    ["#1e3a8a", "네이비"],
    ["#38bdf8", "스카이"],
    ["#facc15", "옐로"],
    ["#92400e", "브라운"],
    ["#9f1239", "버건디"],
  ])("%s ↔ %s 백업 이름이 왕복한다", (hex, name) => {
    expect(getColorDisplayName(hex)).toBe(name);
    expect(resolveColorToHex(name)).toBe(hex);
    expect(getMarkerColorLabel(hex, "equipment")).toBe(name);
  });

  it("개통완료 흰색은 색상 필터 라벨이 흰색이다", () => {
    expect(getMarkerColorLabel("#ffffff", "equipment")).toBe("흰색");
  });
});
