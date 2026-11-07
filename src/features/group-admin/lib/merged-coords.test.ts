import { describe, expect, it } from "vitest";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import { emptyDraft, setMarkerEdit } from "./edit-draft";
import { validateMergedCoords } from "./merged-coords";

function marker(id: string, lat: number | null, lng: number | null) {
  return { id, name: id, lat, lng, tags: [] } as unknown as EquipmentMarker;
}

describe("validateMergedCoords", () => {
  it("한쪽 좌표만 비운 수정을 잡는다", () => {
    const original = marker("a", 37.5, 127);
    const draft = setMarkerEdit(emptyDraft(), original, { lat: null });
    const issues = validateMergedCoords([{ ...original, lat: null } as unknown as EquipmentMarker], draft);
    expect(issues.map((i) => i.key)).toEqual(["marker:a:lat"]);
  });

  it("원래 좌표가 없던 마커에 한쪽만 입력해도 잡는다", () => {
    const original = marker("a", null, null);
    const draft = setMarkerEdit(emptyDraft(), original, { lng: 127 });
    const issues = validateMergedCoords([{ ...original, lng: 127 } as EquipmentMarker], draft);
    expect(issues).toHaveLength(1);
  });

  it("둘 다 입력하거나 둘 다 비우면 통과한다", () => {
    const original = marker("a", 37.5, 127);
    const both = setMarkerEdit(emptyDraft(), original, { lat: null, lng: null });
    expect(
      validateMergedCoords([{ ...original, lat: null, lng: null } as unknown as EquipmentMarker], both),
    ).toEqual([]);
  });

  it("좌표를 건드리지 않은 마커는 원래 한쪽이 비어 있어도 검사하지 않는다", () => {
    const original = marker("a", 37.5, null);
    const draft = setMarkerEdit(emptyDraft(), original, { memo: "x" });
    expect(validateMergedCoords([original], draft)).toEqual([]);
  });
});
