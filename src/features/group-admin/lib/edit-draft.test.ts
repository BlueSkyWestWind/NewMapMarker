import { describe, expect, it } from "vitest";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type { EditDraft, InfoRecord } from "../types";
import {
  applyDraftToMarkers,
  countChanges,
  emptyDraft,
  queueOps,
  setInfoEdit,
  setMarkerEdit,
  validateDraft,
} from "./edit-draft";

function marker(
  overrides: Partial<EquipmentMarker> & { id: string },
): EquipmentMarker {
  return {
    name: overrides.id,
    lat: 37.5,
    lng: 127,
    memo: "",
    tags: [],
    color: "",
    facilityTeam: "",
    roadAddress: "",
    jibunAddress: "",
    facilityCode: "",
    groupKey: "g",
    groupRole: "단독",
    ...overrides,
  } as EquipmentMarker;
}

function info(overrides: Partial<InfoRecord> = {}): InfoRecord {
  return {
    id: 1,
    markerId: "a",
    projectCode: "",
    facilityYear: "2026",
    businessType: "",
    finalStationName: "",
    eqClass: "",
    eqType: "",
    installDate: "",
    openDate: "",
    ...overrides,
  };
}

describe("setMarkerEdit", () => {
  it("값이 바뀌면 키가 생기고 원래 값으로 되돌리면 사라진다", () => {
    const a = marker({ id: "a", name: "원본" });
    const d1 = setMarkerEdit(emptyDraft(), a, { name: "수정" });
    expect(d1.markerEdits.a).toEqual({ name: "수정" });
    const d2 = setMarkerEdit(d1, a, { name: "원본" });
    expect(d2.markerEdits).toEqual({});
  });

  it("다른 칸은 남기고 이전 변경분을 바꾸지 않는다", () => {
    const a = marker({ id: "a", name: "원본" });
    const d1 = setMarkerEdit(emptyDraft(), a, { name: "수정", memo: "m" });
    const d2 = setMarkerEdit(d1, a, { name: "원본" });
    expect(d2.markerEdits.a).toEqual({ memo: "m" });
    expect(d1.markerEdits.a).toEqual({ name: "수정", memo: "m" });
  });

  it("배열(태그)은 내용이 같으면 변경으로 보지 않는다", () => {
    const a = marker({ id: "a", tags: ["x", "y"] });
    const d = setMarkerEdit(emptyDraft(), a, { tags: ["x", "y"] });
    expect(d.markerEdits).toEqual({});
  });
});

describe("setInfoEdit", () => {
  it("정보 행 ID로 쌓고 원래 값으로 되돌리면 사라진다", () => {
    const row = info({ id: 7, installDate: "2026-01-01" });
    const d1 = setInfoEdit(emptyDraft(), row, { installDate: "2026-02-01" });
    expect(d1.infoEdits[7]).toEqual({ installDate: "2026-02-01" });
    const d2 = setInfoEdit(d1, row, { installDate: "2026-01-01" });
    expect(d2.infoEdits).toEqual({});
  });
});

describe("queueOps", () => {
  it("연산을 순서대로 누적한다", () => {
    const d1 = queueOps(emptyDraft(), [{ type: "delete", ids: ["a"] }]);
    const d2 = queueOps(d1, [
      { type: "update", ids: ["b"], patch: { group_role: "SUB" } },
    ]);
    expect(d2.ops.map((o) => o.type)).toEqual(["delete", "update"]);
    expect(d1.ops).toHaveLength(1);
  });
});

describe("applyDraftToMarkers", () => {
  it("이름·좌표 수정이 반영된다", () => {
    const a = marker({ id: "a" });
    const b = marker({ id: "b" });
    const draft = setMarkerEdit(emptyDraft(), a, {
      name: "새 이름",
      lat: 36,
      lng: 128,
    });
    const after = applyDraftToMarkers([a, b], draft);
    expect(after[0]).toMatchObject({ name: "새 이름", lat: 36, lng: 128 });
    expect(after[1]).toBe(b);
    expect(a.name).toBe("a");
  });

  it("대표 지정 뒤 분리를 연속 큐에 넣어도 최종 상태가 맞다", () => {
    const r = marker({ id: "r", groupRole: "대표" });
    const s = marker({ id: "s", groupRole: "SUB", parentMarkerId: "r" });
    let draft: EditDraft = queueOps(emptyDraft(), [
      {
        type: "update",
        ids: ["r"],
        patch: { group_role: "SUB", parent_marker_id: "s" },
      },
      {
        type: "update",
        ids: ["s"],
        patch: { group_role: "대표", parent_marker_id: null },
      },
    ]);
    draft = queueOps(draft, [
      {
        type: "update",
        ids: ["r"],
        patch: { group_key: "g:r", group_role: "단독", parent_marker_id: null },
      },
    ]);
    const after = applyDraftToMarkers([r, s], draft);
    expect(after.find((m) => m.id === "s")).toMatchObject({
      groupRole: "대표",
      parentMarkerId: null,
    });
    expect(after.find((m) => m.id === "r")).toMatchObject({
      groupKey: "g:r",
      groupRole: "단독",
      parentMarkerId: null,
    });
  });

  it("삭제한 마커는 빠지고 그 마커의 필드 수정은 무시된다", () => {
    const a = marker({ id: "a" });
    const b = marker({ id: "b" });
    let draft = setMarkerEdit(emptyDraft(), a, { name: "x" });
    draft = queueOps(draft, [{ type: "delete", ids: ["a"] }]);
    const after = applyDraftToMarkers([a, b], draft);
    expect(after.map((m) => m.id)).toEqual(["b"]);
  });
});

describe("countChanges", () => {
  it("수정한 칸, 정보 칸, 연산 수를 합친다", () => {
    const a = marker({ id: "a" });
    let draft = setMarkerEdit(emptyDraft(), a, { name: "x", memo: "y" });
    draft = setInfoEdit(draft, info({ id: 3 }), { openDate: "2026-01-31" });
    draft = queueOps(draft, [
      { type: "update", ids: ["b"], patch: { group_role: "SUB" } },
    ]);
    expect(countChanges(draft)).toBe(4);
  });

  it("삭제한 마커의 필드 수정은 세지 않는다", () => {
    const a = marker({ id: "a" });
    let draft = setMarkerEdit(emptyDraft(), a, { name: "x", memo: "y" });
    draft = queueOps(draft, [{ type: "delete", ids: ["a"] }]);
    expect(countChanges(draft)).toBe(1);
  });

  it("변경이 없으면 0", () => {
    expect(countChanges(emptyDraft())).toBe(0);
  });
});

describe("validateDraft", () => {
  const a = marker({ id: "a" });
  const edit = (patch: Parameters<typeof setMarkerEdit>[2]) =>
    validateDraft(setMarkerEdit(emptyDraft(), a, patch));

  it("이름이 빈 값이면 이슈", () => {
    expect(edit({ name: "  " })).toHaveLength(1);
    expect(edit({ name: "정상" })).toEqual([]);
  });

  it("위도·경도 범위를 벗어나면 이슈", () => {
    expect(edit({ lat: 32.9 })).toHaveLength(1);
    expect(edit({ lat: 39.1 })).toHaveLength(1);
    expect(edit({ lng: 123.9 })).toHaveLength(1);
    expect(edit({ lng: 132.1 })).toHaveLength(1);
    expect(edit({ lat: 33, lng: 124 })).toEqual([]);
    expect(edit({ lat: 39, lng: 132 })).toEqual([]);
  });

  it("한쪽만 null이면 이슈, 둘 다 null이면 통과", () => {
    expect(edit({ lat: 37, lng: null })).toHaveLength(1);
    expect(edit({ lat: null, lng: 128 })).toHaveLength(1);
    expect(edit({ lat: null, lng: null })).toEqual([]);
  });

  it("날짜는 형식과 실제 달력 날짜를 확인한다", () => {
    const check = (installDate: string) =>
      validateDraft(setInfoEdit(emptyDraft(), info(), { installDate }));
    expect(check("2026-13-01")).toHaveLength(1);
    expect(check("2026/01/01")).toHaveLength(1);
    expect(check("2026-02-30")).toHaveLength(1);
    expect(check("")).toEqual([]);
    expect(check("2026-01-31")).toEqual([]);
  });

  it("태그는 문자열 배열이어야 한다", () => {
    expect(edit({ tags: ["a", "b"] })).toEqual([]);
    expect(edit({ tags: [1, "b"] as unknown as string[] })).toHaveLength(1);
    expect(edit({ tags: "a" as unknown as string[] })).toHaveLength(1);
  });
});
