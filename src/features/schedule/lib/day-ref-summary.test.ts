import { describe, expect, it } from "vitest";
import { formatRefNotice, summarizeRefSources } from "./day-ref-summary";

describe("summarizeRefSources", () => {
  it("층별로 센다. notErp는 공정관리가 아닌 모든 행이다", () => {
    const rows = [
      { refSource: "erp" as const },
      { refSource: "erp" as const },
      { refSource: "archive" as const },
      { refSource: "marker" as const },
      { refSource: "marker" as const },
      { refSource: null },
    ];

    expect(summarizeRefSources(rows)).toEqual({ erp: 2, archive: 1, marker: 2, none: 1, notErp: 4 });
  });

  it("빈 목록은 모두 0이다", () => {
    expect(summarizeRefSources([])).toEqual({ erp: 0, archive: 0, marker: 0, none: 0, notErp: 0 });
  });
});

describe("formatRefNotice", () => {
  it("공정관리가 아닌 행이 없으면 null이다", () => {
    expect(formatRefNotice({ erp: 3, archive: 0, marker: 0, none: 0, notErp: 0 })).toBeNull();
  });

  it("0이 아닌 층만 괄호에 적는다", () => {
    expect(formatRefNotice({ erp: 1, archive: 2, marker: 4, none: 3, notErp: 9 })).toBe(
      "공정관리 정보가 없는 국소 9건 (누적 2건 · 마커 4건 · 없음 3건)",
    );
    expect(formatRefNotice({ erp: 0, archive: 0, marker: 0, none: 2, notErp: 2 })).toBe(
      "공정관리 정보가 없는 국소 2건 (없음 2건)",
    );
  });
});
