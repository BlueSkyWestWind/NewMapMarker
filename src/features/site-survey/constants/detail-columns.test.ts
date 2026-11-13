import { describe, expect, it } from "vitest";
import { columnLetter, DETAIL_COLUMNS } from "./detail-columns";

describe("DETAIL_COLUMNS", () => {
  it("세부 시트 A~CB 80열이 0부터 연속이다", () => {
    expect(DETAIL_COLUMNS).toHaveLength(80);
    DETAIL_COLUMNS.forEach((col, i) => expect(col.index).toBe(i));
  });

  it("열 이름이 Excel 규칙과 같다", () => {
    expect(DETAIL_COLUMNS[0].letter).toBe("A");
    expect(DETAIL_COLUMNS[79].letter).toBe("CB");
  });

  it("머리글이 세부 시트와 같다", () => {
    expect(DETAIL_COLUMNS[0].header).toBe("연도");
    expect(DETAIL_COLUMNS[7].header).toBe("국소명-최종");
    expect(DETAIL_COLUMNS[24].header).toBe("모국 (&기지국)");
    expect(DETAIL_COLUMNS[25].header).toBe("집중국");
    expect(DETAIL_COLUMNS[50].header).toBe("문제점 세부내역 및 대책방안");
    expect(DETAIL_COLUMNS[72].header).toBe("Site명");
    expect(DETAIL_COLUMNS[75].header).toBe("AI담당");
    expect(DETAIL_COLUMNS[79].header).toBe("사전설계 완료일");
  });
});

describe("columnLetter", () => {
  it("0 기준 인덱스를 열 이름으로 바꾼다", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(51)).toBe("AZ");
    expect(columnLetter(79)).toBe("CB");
  });
});
