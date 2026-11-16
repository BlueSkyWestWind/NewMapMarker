import { describe, expect, it } from "vitest";
import {
  buildExclusionRows,
  EXCLUSION_NOTE_MAX,
  EXCLUSION_REASONS,
  excludedKeySet,
  exclusionKey,
  isExcludedText,
  validateExclusion,
} from "@/features/schedule/lib/excluded-stations";

describe("EXCLUSION_REASONS & exclusionKey", () => {
  it("사유 3종이 정의되어 있다", () => {
    expect(EXCLUSION_REASONS).toEqual([
      { key: "canceled", label: "사업 취소" },
      { key: "unneeded", label: "시설 불필요" },
      { key: "other", label: "기타" },
    ]);
  });

  it("exclusionKey는 공백·하이픈·대소문자를 정규화한다", () => {
    expect(exclusionKey(" 가 국소-A ")).toBe("가국소a");
    expect(exclusionKey("Station_1")).toBe("station_1");
  });
});

describe("validateExclusion", () => {
  it("사업 취소·시설 불필요는 빈 메모도 허용하고 앞뒤 공백을 정리한다", () => {
    expect(validateExclusion({ reason: "canceled", note: "" })).toEqual({ ok: true, note: "" });
    expect(validateExclusion({ reason: "unneeded", note: "  확인 완료  " })).toEqual({
      ok: true,
      note: "확인 완료",
    });
  });

  it("기타(other)는 빈 메모·공백만 있는 메모를 거부한다", () => {
    expect(validateExclusion({ reason: "other", note: "" })).toEqual({
      ok: false,
      error: "note-required",
    });
    expect(validateExclusion({ reason: "other", note: "   " })).toEqual({
      ok: false,
      error: "note-required",
    });
    expect(validateExclusion({ reason: "other", note: " 사유 메모 " })).toEqual({
      ok: true,
      note: "사유 메모",
    });
  });

  it("메모가 100자를 넘으면 note-too-long을 돌려준다", () => {
    const exact = "가".repeat(EXCLUSION_NOTE_MAX);
    const over = "가".repeat(EXCLUSION_NOTE_MAX + 1);
    expect(validateExclusion({ reason: "canceled", note: exact })).toEqual({ ok: true, note: exact });
    expect(validateExclusion({ reason: "canceled", note: over })).toEqual({
      ok: false,
      error: "note-too-long",
    });
  });
});

describe("buildExclusionRows & excludedKeySet & isExcludedText", () => {
  it("station_key 중복은 앞의 것을 유지하고 빈 이름은 제외하며 markerId 없으면 null이다", () => {
    const rows = buildExclusionRows(
      [
        { label: " 국소 A ", markerId: "m1" },
        { label: "국소-a", markerId: "m2" }, // 동일 키 -> 무시
        { label: "   " }, // 빈 이름 -> 무시
        { label: "국소B" }, // markerId 생략 -> null
      ],
      "canceled",
      "  메모1  ",
    );

    expect(rows).toEqual([
      {
        station_key: "국소a",
        label: "국소 A",
        marker_id: "m1",
        reason: "canceled",
        note: "메모1",
      },
      {
        station_key: "국소b",
        label: "국소B",
        marker_id: null,
        reason: "canceled",
        note: "메모1",
      },
    ]);
  });

  it("excludedKeySet과 isExcludedText가 정규화 기준으로 포함 여부를 판별한다", () => {
    const keys = excludedKeySet([{ stationKey: "국소a" }, { stationKey: "국소b" }]);
    expect(isExcludedText(" 국소-A ", keys)).toBe(true);
    expect(isExcludedText("국소C", keys)).toBe(false);
  });
});
