import { describe, expect, it } from "vitest";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type { InfoRecord } from "../types";
import { planBulkEdit } from "./bulk-edit";
import { emptyDraft } from "./edit-draft";

function marker(overrides: Partial<EquipmentMarker> & { id: string }): EquipmentMarker {
  return {
    name: overrides.id,
    lat: 37.5,
    lng: 127,
    memo: "",
    tags: [],
    color: "#10b981",
    facilityTeam: "",
    roadAddress: "",
    jibunAddress: "",
    facilityCode: "",
    ...overrides,
  } as EquipmentMarker;
}

function info(id: number, markerId: string, businessType = ""): InfoRecord {
  return {
    id,
    markerId,
    projectCode: "",
    facilityYear: "2026",
    businessType,
    finalStationName: "",
    eqClass: "",
    eqType: "",
    installDate: "",
    openDate: "",
  };
}

describe("planBulkEdit", () => {
  it("사업구분은 선택한 마커의 모든 정보 행에 적용한다", () => {
    const markers = [marker({ id: "a" }), marker({ id: "b" })];
    const rows = [info(1, "a"), info(2, "a"), info(3, "b"), info(4, "z")];
    const { draft, skipped } = planBulkEdit(emptyDraft(), markers, rows, { businessType: "신규" });
    expect(draft.infoEdits).toEqual({
      1: { businessType: "신규" },
      2: { businessType: "신규" },
      3: { businessType: "신규" },
    });
    expect(skipped).toBe(0);
  });

  it("담당팀과 색상은 마커 수정으로 쌓는다", () => {
    const markers = [marker({ id: "a" }), marker({ id: "b" })];
    const { draft } = planBulkEdit(emptyDraft(), markers, [], {
      facilityTeam: "1팀",
      color: "#2563eb",
    });
    expect(draft.markerEdits.a).toEqual({ facilityTeam: "1팀", color: "#2563eb" });
    expect(draft.markerEdits.b).toEqual({ facilityTeam: "1팀", color: "#2563eb" });
  });

  it("태그 추가는 기존 태그를 보존하고 중복과 빈 값을 만들지 않는다", () => {
    const markers = [marker({ id: "a", tags: ["x"] }), marker({ id: "b", tags: [] })];
    const { draft } = planBulkEdit(emptyDraft(), markers, [], { addTags: [" x ", "y", "", "y"] });
    expect(draft.markerEdits.a).toEqual({ tags: ["x", "y"] });
    expect(draft.markerEdits.b).toEqual({ tags: ["x", "y"] });
  });

  it("태그 제거는 나머지를 보존하고 없는 태그는 무시한다", () => {
    const markers = [marker({ id: "a", tags: ["x", "y", "z"] }), marker({ id: "b", tags: ["q"] })];
    const { draft } = planBulkEdit(emptyDraft(), markers, [], { removeTags: ["y", "nope"] });
    expect(draft.markerEdits.a).toEqual({ tags: ["x", "z"] });
    expect(draft.markerEdits.b).toBeUndefined();
  });

  it("값이 이미 같으면 변경분에 넣지 않는다", () => {
    const markers = [marker({ id: "a", facilityTeam: "1팀", color: "#2563eb", tags: ["x"] })];
    const rows = [info(1, "a", "신규")];
    const { draft } = planBulkEdit(emptyDraft(), markers, rows, {
      facilityTeam: "1팀",
      color: "#2563eb",
      addTags: ["x"],
      businessType: "신규",
    });
    expect(draft.markerEdits).toEqual({});
    expect(draft.infoEdits).toEqual({});
  });

  it("정의되지 않은 항목은 건드리지 않는다", () => {
    const markers = [marker({ id: "a", facilityTeam: "2팀" })];
    const { draft } = planBulkEdit(emptyDraft(), markers, [info(1, "a")], { color: "#f43f5e" });
    expect(draft.markerEdits.a).toEqual({ color: "#f43f5e" });
    expect(draft.infoEdits).toEqual({});
  });

  it("정보 행이 없는 마커에 사업구분을 요청하면 건너뛰고 수를 센다", () => {
    const markers = [marker({ id: "a" }), marker({ id: "b" })];
    const { draft, skipped } = planBulkEdit(emptyDraft(), markers, [info(1, "a")], {
      businessType: "신규",
      color: "#f43f5e",
    });
    expect(skipped).toBe(1);
    expect(draft.infoEdits).toEqual({ 1: { businessType: "신규" } });
    // 건너뛴 것은 사업구분뿐이다. 색상은 그 마커에도 적용한다.
    expect(draft.markerEdits.b).toEqual({ color: "#f43f5e" });
  });

  it("사업구분을 요청하지 않으면 건너뛴 수는 0이다", () => {
    const { skipped } = planBulkEdit(emptyDraft(), [marker({ id: "a" })], [], { color: "#f43f5e" });
    expect(skipped).toBe(0);
  });

  it("기존 변경분을 보존하고 원본 draft를 바꾸지 않는다", () => {
    const m = marker({ id: "a" });
    const base = { ...emptyDraft(), markerEdits: { a: { memo: "m" } } };
    const { draft } = planBulkEdit(base, [m], [], { color: "#f43f5e" });
    expect(draft.markerEdits.a).toEqual({ memo: "m", color: "#f43f5e" });
    expect(base.markerEdits.a).toEqual({ memo: "m" });
  });

  it("태그 추가를 두 번 반영하면 쌓인다", () => {
    const m = marker({ id: "a", tags: ["x"] });
    const first = planBulkEdit(emptyDraft(), [m], [], { addTags: ["a"] }).draft;
    const second = planBulkEdit(first, [m], [], { addTags: ["b"] }).draft;
    expect(second.markerEdits.a).toEqual({ tags: ["x", "a", "b"] });
  });

  it("태그 추가 뒤 제거도 쌓인다", () => {
    const m = marker({ id: "a", tags: ["x"] });
    const first = planBulkEdit(emptyDraft(), [m], [], { addTags: ["a"] }).draft;
    const second = planBulkEdit(first, [m], [], { removeTags: ["x"] }).draft;
    expect(second.markerEdits.a).toEqual({ tags: ["a"] });
  });

  it("태그가 원래 목록으로 돌아오면 변경분에서 빠진다", () => {
    const m = marker({ id: "a", tags: ["x"] });
    const first = planBulkEdit(emptyDraft(), [m], [], { addTags: ["a"] }).draft;
    const second = planBulkEdit(first, [m], [], { removeTags: ["a"] }).draft;
    expect(second.markerEdits).toEqual({});
  });
});
