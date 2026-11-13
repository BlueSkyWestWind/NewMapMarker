import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { filterSurveyFiles, parseSurveyWorkbook, readSurveyFile, readSurveyFiles, SurveyFormatError } from "./parse-survey";
import { makeSurveyWorkbook } from "./test-support/make-survey-workbook";

/** 실사서처럼 섹션 제목은 A열, 라벨 오른쪽 값은 병합 끝 다음 칸에 둔다 */
const BASE = {
  A1: "현 장 조 사 서",
  A5: "1. 일반현황",
  A6: "방식",
  A7: "광중계기",
  A8: "사업년도",
  A9: "2026",
  S10: "프로젝트 코드",
  Z10: "E.C26A.55.0412",
  S11: "통합시설코드",
  Z11: "2026Y9628",
  A20: "2. 치국현황",
};
const BASE_MERGES = ["S10:Y10", "S11:Y11"];

function doc(extra: Record<string, string> = {}, merges: string[] = []) {
  return parseSurveyWorkbook(
    makeSurveyWorkbook({ cells: { ...BASE, ...extra }, merges: [...BASE_MERGES, ...merges] }),
    "x.xlsx",
  );
}

describe("get / has", () => {
  it("below: 라벨 바로 아래 줄의 값", () => {
    expect(doc().get({ section: 1, label: "방식", direction: "below" })).toBe("광중계기");
  });

  it("right: 병합 끝 다음의 첫 값", () => {
    expect(doc().get({ section: 1, label: "프로젝트 코드", direction: "right" })).toBe("E.C26A.55.0412");
  });

  it("right: 값 칸이 비면 빈 문자열이고 has는 true다", () => {
    const d = doc({ S12: "치국목적" }, ["S12:Y12"]);
    const ref = { section: 1, label: "치국목적", direction: "right" as const };
    expect(d.get(ref)).toBe("");
    expect(d.has(ref)).toBe(true);
  });

  it("같은 라벨이 여러 섹션에 있어도 섹션으로 구분한다", () => {
    const d = doc({ S12: "기타1", Z12: "일반 메모", S21: "기타1", Z21: "치국 메모" }, ["S12:Y12", "S21:Y21"]);
    expect(d.get({ section: 1, label: "기타1", direction: "right" })).toBe("일반 메모");
    expect(d.get({ section: 2, label: "기타1", direction: "right" })).toBe("치국 메모");
  });

  it("nth로 같은 섹션의 두 번째 라벨을 고른다", () => {
    const d = doc({ S12: "기타1", Z12: "첫째", S13: "기타1", Z13: "둘째" }, ["S12:Y12", "S13:Y13"]);
    expect(d.get({ section: 1, label: "기타1", direction: "right", nth: 1 })).toBe("둘째");
  });

  it("라벨이 없으면 has=false, get은 빈 문자열이다", () => {
    const d = doc();
    const ref = { section: 1, label: "없는라벨", direction: "below" as const };
    expect(d.has(ref)).toBe(false);
    expect(d.get(ref)).toBe("");
  });

  it("라벨의 공백과 줄바꿈 차이는 무시한다", () => {
    const d = doc({ A12: "구 세부주소\n (번지)", A13: "437번지" });
    expect(d.get({ section: 1, label: "구 세부주소 (번지)", direction: "below" })).toBe("437번지");
  });
});

describe("ids", () => {
  it("사업년도·프로젝트 코드·통합시설코드를 읽는다", () => {
    expect(doc().ids()).toEqual({ year: "2026", project: "E.C26A.55.0412", facilityCode: "2026Y9628" });
  });
});

describe("notes", () => {
  it("기타N을 문서 순서로 모으고 값이 없는 것은 건너뛴다", () => {
    const d = doc(
      { S12: "기타1", Z12: "일반1", S13: "기타2", Z13: "일반2", S21: "기타1", Z21: "치국1", S22: "기타2" },
      ["S12:Y12", "S13:Y13", "S21:Y21", "S22:Y22"],
    );
    expect(d.notes()).toEqual([
      { section: 1, label: "기타1", value: "일반1" },
      { section: 1, label: "기타2", value: "일반2" },
      { section: 2, label: "기타1", value: "치국1" },
    ]);
  });

  it("기타(OM) 같은 괄호 라벨은 제외한다", () => {
    const d = doc({ S12: "기타(OM)", Z12: "해당없음" }, ["S12:Y12"]);
    expect(d.notes()).toEqual([]);
  });

  it("오른쪽 칸이 다른 기타N 라벨이면 값이 없는 것으로 본다", () => {
    const d = doc({ S12: "기타1", Z12: "기타2" }, ["S12:Y12"]);
    expect(d.notes()).toEqual([]);
  });

  it("현장조사 사진 줄 아래의 기타1~는 읽지 않는다", () => {
    const d = doc({ A30: "현장조사 사진", S31: "기타1", Z31: "기타2", S32: "기타2", Z32: "기타3" }, ["S31:Y31", "S32:Y32"]);
    expect(d.notes()).toEqual([]);
  });
});

describe("parseSurveyWorkbook", () => {
  it("현장조사서 제목이 없으면 양식 오류다", () => {
    const wb = makeSurveyWorkbook({ cells: { A5: "1. 일반현황" } });
    expect(() => parseSurveyWorkbook(wb, "x.xlsx")).toThrow(SurveyFormatError);
  });

  it("1. 일반현황이 없으면 양식 오류다", () => {
    const wb = makeSurveyWorkbook({ cells: { A1: "현장조사서", A5: "2. 치국현황" } });
    expect(() => parseSurveyWorkbook(wb, "x.xlsx")).toThrow(SurveyFormatError);
  });
});

function toFile(name: string, extra: Record<string, string> = {}): File {
  const wb = makeSurveyWorkbook({ cells: { ...BASE, ...extra }, merges: BASE_MERGES });
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([bytes], name);
}

describe("readSurveyFile", () => {
  it("File을 읽어 SurveyDoc을 만든다", async () => {
    const d = await readSurveyFile(toFile("x.xlsx"));
    expect(d.fileName).toBe("x.xlsx");
    expect(d.get({ section: 1, label: "방식", direction: "below" })).toBe("광중계기");
  });
});

describe("readSurveyFiles", () => {
  it("동시에 읽는 파일이 4개를 넘지 않고 결과는 입력 순서다", async () => {
    const files = Array.from({ length: 10 }, (_, i) => toFile(`f${i}.xlsx`));
    const docs = await readSurveyFiles(files);
    expect(docs.errors).toEqual([]);
    expect(docs.docs.map((d) => d.fileName)).toEqual(files.map((f) => f.name));
  });

  it("진행 중인 읽기는 최대 4개이고 4개까지는 실제로 겹친다", async () => {
    let active = 0;
    let peak = 0;
    const reader = async (file: File) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return {
        fileName: file.name,
        get: () => "",
        has: () => false,
        notes: () => [],
        ids: () => ({ year: "", project: "", facilityCode: "" }),
      };
    };
    const files = Array.from({ length: 10 }, (_, i) => new File([""], `f${i}.xlsx`));
    await readSurveyFiles(files, 4, reader);
    expect(peak).toBe(4);
  });

  it("양식이 아닌 파일은 errors에만 들어가고 나머지는 계속 읽는다", async () => {
    const bad = new File([XLSX.write(makeSurveyWorkbook({ cells: { A1: "x" } }), { type: "array", bookType: "xlsx" })], "bad.xlsx");
    const res = await readSurveyFiles([toFile("a.xlsx"), bad, toFile("c.xlsx")]);
    expect(res.docs.map((d) => d.fileName)).toEqual(["a.xlsx", "c.xlsx"]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].name).toBe("bad.xlsx");
  });
});

describe("filterSurveyFiles", () => {
  const f = (name: string) => new File([""], name);
  it("임시 잠금 파일과 xlsx가 아닌 파일은 건너뛴다", () => {
    const r = filterSurveyFiles([f("~$a.xlsx"), f("a.pdf"), f("B.XLSX")]);
    expect(r.accepted.map((x) => x.name)).toEqual(["B.XLSX"]);
    expect(r.skipped).toEqual([
      { name: "~$a.xlsx", reason: "temp" },
      { name: "a.pdf", reason: "not-xlsx" },
    ]);
  });
  it("전부 건너뛰면 accepted가 비어 있다", () => {
    expect(filterSurveyFiles([f("~$a.xlsx"), f("a.pdf")]).accepted).toEqual([]);
  });
});
