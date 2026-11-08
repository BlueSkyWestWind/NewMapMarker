import { describe, expect, it } from "vitest";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type { MarkerGroup } from "../types";
import { emptyDraft, setMarkerEdit } from "./edit-draft";
import { planSyncSubCoords } from "./sync-coords";

function marker(id: string, over: Partial<EquipmentMarker> = {}): EquipmentMarker {
  return {
    id,
    name: id,
    lat: 35,
    lng: 126,
    memo: "",
    tags: [],
    color: "#10b981",
    facilityTeam: "",
    ...over,
  } as EquipmentMarker;
}

function group(markers: EquipmentMarker[], representative: EquipmentMarker | null): MarkerGroup {
  return { key: "k", lotAddress: "k", markers, representative, hasNoCoord: false, isSuspect: false };
}

const rep = marker("rep", { lat: 34.7, lng: 126.75, groupRole: "대표" });

describe("planSyncSubCoords", () => {
  it("SUB 좌표를 대표 좌표로 맞춘다", () => {
    const sub = marker("sub", { lat: 34.71, lng: 126.76, groupRole: "SUB", parentMarkerId: "rep" });
    const { draft, changed } = planSyncSubCoords(emptyDraft(), [group([rep, sub], rep)]);
    expect(changed).toBe(1);
    expect(draft.markerEdits.sub).toEqual({ lat: 34.7, lng: 126.75 });
    expect(draft.markerEdits.rep).toBeUndefined();
  });

  it("이미 같은 좌표면 건드리지 않는다", () => {
    const sub = marker("sub", { lat: 34.7, lng: 126.75, groupRole: "SUB", parentMarkerId: "rep" });
    const { draft, changed } = planSyncSubCoords(emptyDraft(), [group([rep, sub], rep)]);
    expect(changed).toBe(0);
    expect(draft.markerEdits).toEqual({});
  });

  it("대표에 좌표가 없으면 건너뛰고 SUB 좌표를 지우지 않는다", () => {
    const noCoordRep = marker("rep", { lat: undefined, lng: undefined, groupRole: "대표" });
    const sub = marker("sub", { groupRole: "SUB", parentMarkerId: "rep" });
    const result = planSyncSubCoords(emptyDraft(), [group([noCoordRep, sub], noCoordRep)]);
    expect(result.changed).toBe(0);
    expect(result.skippedNoRep).toBe(1);
    expect(result.draft.markerEdits).toEqual({});
  });

  it("대표 좌표를 먼저 고쳤다면 그 값으로 맞춘다", () => {
    const sub = marker("sub", { groupRole: "SUB", parentMarkerId: "rep" });
    const base = setMarkerEdit(emptyDraft(), rep, { lat: 34.8, lng: 126.8 });
    const { draft } = planSyncSubCoords(base, [group([rep, sub], rep)]);
    expect(draft.markerEdits.sub).toEqual({ lat: 34.8, lng: 126.8 });
  });

  it("단독 국소는 대상이 아니다", () => {
    const solo = marker("solo", { lat: 1, lng: 2, groupRole: "단독" });
    const { changed } = planSyncSubCoords(emptyDraft(), [group([rep, solo], rep)]);
    expect(changed).toBe(0);
  });
});
