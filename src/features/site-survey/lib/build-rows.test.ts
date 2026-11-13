import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS as D } from "../constants/default-settings";
import { FIELD_RULES } from "../constants/survey-fields";
import type { FieldId, NoteItem, SourceRef, SurveyDoc } from "../types";
import {
  buildRow,
  defaultEnabledFields,
  duplicateFacilityCodes,
  effectiveEnabled,
  summarizeRow,
} from "./build-rows";
import { mergeSettings } from "./settings-schema";

const key = (s: SourceRef) => `${s.section}/${s.label}/${s.direction}`;

/** 모든 규칙의 라벨이 존재하는(값은 빈) 가짜 문서. overrides로 값을 채우고 missing 라벨은 지운다 */
function fakeDoc(
  overrides: Record<string, string> = {},
  opts: { missing?: string[]; notes?: NoteItem[]; fileName?: string } = {},
): SurveyDoc {
  const values: Record<string, string> = {};
  for (const rule of FIELD_RULES) for (const s of Object.values(rule.sources)) values[key(s)] = "";
  values["2/장비설치 층/below"] = "";
  Object.assign(values, overrides);
  for (const m of opts.missing ?? []) delete values[m];
  return {
    fileName: opts.fileName ?? "E.C26A.55.0412_2026Y9628_테스트.xlsx",
    get: (s) => values[key(s)] ?? "",
    has: (s) => key(s) in values,
    notes: () => opts.notes ?? [],
    ids: () => ({ year: "", project: "", facilityCode: "" }),
  };
}

const IDS = {
  "1/사업년도/below": "2026",
  "1/프로젝트 코드/right": "E.C26A.55.0412",
  "1/통합시설코드/right": "2026Y9628",
};
const enabled = defaultEnabledFields(D);

describe("buildRow 기본", () => {
  it("식별 칸은 항상 채우고 꺼진 칸은 키가 없다", () => {
    const row = buildRow(fakeDoc({ ...IDS, "1/확정국소명/below": "수완포레외부_1-AAU" }), D, enabled);
    expect(row.cells[0]).toBe("2026");
    expect(row.cells[1]).toBe("E.C26A.55.0412");
    expect(row.cells[2]).toBe("2026Y9628");
    expect(row.cells[7]).toBe("수완포레외부_1-AAU");
    expect(50 in row.cells).toBe(false);
    expect(72 in row.cells).toBe(false);
  });

  it("공중선 형상 1S는 1이 된다", () => {
    const row = buildRow(fakeDoc({ ...IDS, "1/방식/below": "광중계기", "5/공중선방식/below": "1S" }), D, enabled);
    expect(row.cells[59]).toBe("1");
  });

  it("공용화 주관사 LGT는 LGU+가 되고 사업 차수는 YY-NN이 된다", () => {
    const row = buildRow(fakeDoc({ ...IDS, "2/공용화주관사/below": "LGT", "1/사업차수/below": "5차" }), D, enabled);
    expect(row.cells[55]).toBe("LGU+");
    expect(row.cells[10]).toBe("26-05");
  });

  it("주소는 구주소와 번지를 잇고 지역 구분·세부를 만든다", () => {
    const row = buildRow(
      fakeDoc({ ...IDS, "2/구주소/below": "전남광주통합특별시 광산구 수완동", "2/구 세부주소 (번지)/below": "327-6" }),
      D,
      enabled,
    );
    expect(row.cells[60]).toBe("전남광주통합특별시 광산구 수완동 327-6번지");
    expect(row.cells[5]).toBe("전남");
    expect(row.cells[6]).toBe("광산구");
  });

  it("지역 구분을 만들 수 없으면 빈 값과 경고를 낸다", () => {
    const row = buildRow(fakeDoc({ ...IDS, "2/구주소/below": "서울 강남구 역삼동" }), D, enabled);
    expect(row.cells[5]).toBe("");
    expect(row.warnings.some((w) => w.field === "지역 구분")).toBe(true);
  });
});

describe("인빌딩 (방식별 예외)", () => {
  const inb = {
    ...IDS,
    "1/방식/below": "인빌딩",
    "5/철탑높이/below": "2",
    "5/공중선방식/below": "OMNI",
    "2/장비설치 층/below": "1층 EPS_A 실",
    "3/시설장소/below": "옥상",
    "4/모국명/below": "S목포옥암통합국-16_B-CDUH10.55.5G.CDU10(내)",
    "4/(LTE)전송로 상위국명/below": "S목포옥암중심국_남악신도시L-DUF30-C1.55.LTE.DU20(",
  };

  it("방식은 광분산, 철탑 형태는 인빌딩, 장비위치는 장비설치 층, 모국은 모국명이다", () => {
    const row = buildRow(fakeDoc(inb), D, enabled);
    expect(row.cells[9]).toBe("광분산");
    expect(row.cells[57]).toBe("인빌딩");
    expect(row.cells[53]).toBe("1층 EPS_A 실");
    expect(row.cells[24]).toBe("S목포옥암통합국");
    expect(row.cells[25]).toBe("S목포옥암통합국");
  });

  it("철탑 규격·공중선 형상은 고정값 없이 원본값 그대로다", () => {
    const row = buildRow(fakeDoc(inb), D, enabled);
    expect(row.cells[58]).toBe("2");
    expect(row.cells[59]).toBe("OMNI");
    const spec = row.fields.find((f) => f.id === "towerSpec")!;
    expect(spec.applied).toBe("");
  });

  it("조건은 치환 전 원본으로 판단하고 applied 표시가 맞다", () => {
    const row = buildRow(fakeDoc(inb), D, enabled);
    const byId = (id: FieldId) => row.fields.find((f) => f.id === id)!;
    expect(byId("method").applied).toBe("alias");
    expect(byId("method").raw).toBe("인빌딩");
    expect(byId("towerType").applied).toBe("mode-rule");
    expect(byId("equipPlace").applied).toBe("mode-rule");
  });

  it("인빌딩이 아니면 예외가 적용되지 않는다(값 0은 0으로 남는다)", () => {
    const row = buildRow(
      fakeDoc({ ...inb, "1/방식/below": "광중계기", "5/철탑높이/below": "0", "5/철탑형태/below": "자립형" }),
      D,
      enabled,
    );
    expect(row.cells[58]).toBe("0");
    expect(row.cells[57]).toBe("자립형");
    expect(row.cells[53]).toBe("옥상");
    expect(row.cells[24]).toBe("S목포옥암중심국");
  });

  it("방식별 예외 목록에서 인빌딩을 빼면 같은 입력도 예외가 없다", () => {
    const off = mergeSettings(D, { modeRules: [] });
    const row = buildRow(fakeDoc({ ...inb, "5/철탑형태/below": "자립형" }), off, enabled);
    expect(row.cells[57]).toBe("자립형");
    expect(row.cells[24]).toBe("S목포옥암중심국");
  });
});

describe("경고", () => {
  it("라벨을 못 찾으면 빈 값과 경고, 라벨이 있고 값만 비면 경고가 없다", () => {
    const missing = buildRow(fakeDoc(IDS, { missing: ["5/철탑형태/below"] }), D, enabled);
    expect(missing.cells[57]).toBe("");
    expect(missing.warnings).toContainEqual({
      fileName: "E.C26A.55.0412_2026Y9628_테스트.xlsx",
      field: "철탑 형태",
      message: "라벨을 찾지 못했습니다: 철탑형태",
    });
    const present = buildRow(fakeDoc(IDS), D, enabled);
    expect(present.warnings.filter((w) => w.field === "철탑 형태")).toEqual([]);
  });

  it("파일명의 코드와 셀 값이 다르면 경고하고 셀 값을 쓴다", () => {
    const row = buildRow(fakeDoc(IDS, { fileName: "E.C26A.55.0278_2026Y8374_x.xlsx" }), D, enabled);
    expect(row.cells[1]).toBe("E.C26A.55.0412");
    expect(row.warnings.some((w) => w.field === "프로젝트")).toBe(true);
    expect(row.warnings.some((w) => w.field === "통합시설코드")).toBe(true);
  });

  it("알 수 없는 방식 값은 경고하고 값은 그대로 내보낸다", () => {
    const row = buildRow(fakeDoc({ ...IDS, "1/방식/below": "인빌딩(광분산)" }), D, enabled);
    expect(row.cells[9]).toBe("인빌딩(광분산)");
    expect(row.warnings).toContainEqual(expect.objectContaining({ field: "방식", message: "알 수 없는 방식 값: 인빌딩(광분산)" }));
  });

  it("방식이 비면 경고가 없고, 알려진 방식 목록에 추가하면 경고가 사라진다", () => {
    const empty = buildRow(fakeDoc(IDS), D, enabled);
    expect(empty.warnings.some((w) => w.message.startsWith("알 수 없는 방식"))).toBe(false);
    const extended = mergeSettings(D, { knownModes: [...D.knownModes, "인빌딩(광분산)"] });
    const row = buildRow(fakeDoc({ ...IDS, "1/방식/below": "인빌딩(광분산)" }), extended, enabled);
    expect(row.warnings.some((w) => w.message.startsWith("알 수 없는 방식"))).toBe(false);
  });
});

describe("선택·설정 변경", () => {
  it("문제점 세부내역을 켜면 구분자로 이어 붙인다", () => {
    const on = new Set(enabled).add("notes");
    const doc = fakeDoc(IDS, {
      notes: [
        { section: 1, label: "기타1", value: "일반1" },
        { section: 3, label: "기타1", value: "안전1" },
      ],
    });
    expect(buildRow(doc, D, on).cells[50]).toBe("일반1/안전1");
  });

  it("Site명을 켜면 접두·꼬리를 지운 이름이 들어간다", () => {
    const on = new Set(enabled).add("siteName");
    const row = buildRow(fakeDoc({ ...IDS, "1/확정국소명/below": "(공동)백운산한재-RRU(F1)" }), D, on);
    expect(row.cells[72]).toBe("백운산한재");
  });

  it("설정의 치환표를 바꾸면 같은 문서의 결과가 바뀐다", () => {
    const doc = fakeDoc({ ...IDS, "1/투자목적 중분류/right": "NW구조혁신" });
    expect(buildRow(doc, D, enabled).cells[15]).toBe("NW슬림화");
    const custom = mergeSettings(D, { fields: { midCategory: { aliases: [{ from: "NW구조혁신", to: "다른값" }] } } });
    expect(buildRow(doc, custom, enabled).cells[15]).toBe("다른값");
    const none = mergeSettings(D, { fields: { midCategory: { aliases: [] } } });
    expect(buildRow(doc, none, enabled).cells[15]).toBe("NW구조혁신");
  });
});

describe("effectiveEnabled", () => {
  it("직접 바꾼 칸은 그 값, 나머지는 설정을 따른다", () => {
    const touched = new Map<FieldId, boolean>([["notes", true], ["facilityName", false]]);
    const set = effectiveEnabled(D, touched);
    expect(set.has("notes")).toBe(true);
    expect(set.has("facilityName")).toBe(false);
    expect(set.has("planName")).toBe(true);
  });

  it("설정이 바뀌어도 touched 칸은 유지되고 비우면 설정을 따른다", () => {
    const changed = mergeSettings(D, { fields: { planName: { enabled: false }, notes: { enabled: true } } });
    const touched = new Map<FieldId, boolean>([["notes", false]]);
    const set = effectiveEnabled(changed, touched);
    expect(set.has("notes")).toBe(false);
    expect(set.has("planName")).toBe(false);
    expect(effectiveEnabled(changed, new Map()).has("notes")).toBe(true);
  });

  it("식별 칸은 항상 켜져 있다", () => {
    const set = effectiveEnabled(D, new Map<FieldId, boolean>([["year", false]]));
    expect(set.has("year")).toBe(true);
  });
});

describe("duplicateFacilityCodes / summarizeRow", () => {
  it("같은 통합시설코드는 한 번만 알리고 두 행 모두 남는다", () => {
    const a = buildRow(fakeDoc(IDS, { fileName: "a.xlsx" }), D, enabled);
    const b = buildRow(fakeDoc(IDS, { fileName: "b.xlsx" }), D, enabled);
    const c = buildRow(fakeDoc({ ...IDS, "1/통합시설코드/right": "2026Y0001" }, { fileName: "c.xlsx" }), D, enabled);
    expect(duplicateFacilityCodes([a, b, c])).toEqual(["2026Y9628"]);
  });

  it("채운 칸 수는 식별 칸을 빼고 센다", () => {
    const row = buildRow(fakeDoc({ ...IDS, "1/확정국소명/below": "X", "1/방식/below": "광중계기" }), D, enabled);
    expect(summarizeRow(row).filledCount).toBe(2);
    expect(summarizeRow(row).warningCount).toBe(row.warnings.length);
  });
});
