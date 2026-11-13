import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../constants/default-settings";
import type { NoteItem, SourceRef, SurveyDoc } from "../types";
import { collectNoteParts } from "./notes";

function fakeDoc(values: Record<string, string>, notes: NoteItem[]): SurveyDoc {
  const key = (s: SourceRef) => `${s.section}/${s.label}`;
  return {
    fileName: "f.xlsx",
    get: (s) => values[key(s)] ?? "",
    has: (s) => key(s) in values,
    notes: () => notes,
    ids: () => ({ year: "", project: "", facilityCode: "" }),
  };
}

const NOTES: NoteItem[] = [
  { section: 1, label: "기타1", value: "일반1" },
  { section: 2, label: "기타1", value: "치국1" },
  { section: 3, label: "기타1", value: "안전1" },
];
const VALUES = { "2/상세출입방법": "옥상문 열쇠", "2/건물구분": "아파트" };

describe("collectNoteParts", () => {
  it("섹션 순서이고 치국현황에서는 상세출입방법·건물구분이 그 섹션의 기타 앞에 온다", () => {
    expect(collectNoteParts(fakeDoc(VALUES, NOTES), DEFAULT_SETTINGS.notes)).toEqual([
      "일반1",
      "옥상문 열쇠",
      "아파트",
      "치국1",
      "안전1",
    ]);
  });

  it("includeEtc=false면 기타N이 빠진다", () => {
    const n = { ...DEFAULT_SETTINGS.notes, includeEtc: false };
    expect(collectNoteParts(fakeDoc(VALUES, NOTES), n)).toEqual(["옥상문 열쇠", "아파트"]);
  });

  it("includeAccess=false면 상세출입방법이 빠진다", () => {
    const n = { ...DEFAULT_SETTINGS.notes, includeAccess: false };
    expect(collectNoteParts(fakeDoc(VALUES, NOTES), n)).not.toContain("옥상문 열쇠");
  });

  it("includeBuilding=false면 건물구분이 빠진다", () => {
    const n = { ...DEFAULT_SETTINGS.notes, includeBuilding: false };
    expect(collectNoteParts(fakeDoc(VALUES, NOTES), n)).not.toContain("아파트");
  });

  it("값이 비면 조각을 만들지 않는다", () => {
    expect(collectNoteParts(fakeDoc({}, [{ section: 1, label: "기타1", value: "" }]), DEFAULT_SETTINGS.notes)).toEqual([]);
  });
});
