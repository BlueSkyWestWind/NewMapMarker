import { describe, expect, it } from "vitest";
import { DETAIL_COLUMNS } from "./detail-columns";
import { DEFAULT_SETTINGS } from "./default-settings";
import { FIELD_BY_ID, FIELD_RULES } from "./survey-fields";

const EXPECTED_HEADERS: Record<string, string> = {
  year: "연도",
  project: "프로젝트",
  facilityCode: "통합시설코드",
  facilityName: "국소명-최종",
  planName: "국소명-계획",
  method: "방식",
  round: "사업 차수",
  workType: "사업 유형",
  subType: "세부사업 유형",
  bigCategory: "사업구분 대분류",
  midCategory: "사업구분 중분류",
  equipFinal: "장비최종",
  equipPlan: "장비계획",
  realty: "부동산 형태",
  equipPlace: "장비위치",
  towerType: "철탑 형태",
  towerSpec: "철탑 규격",
  address: "주소(전체)",
  aiManager: "AI담당",
  antennaShape: "공중선 형상",
  sharer: "공용화 주관사",
  region: "지역 구분",
  regionDetail: "지역 세부",
  mokuk: "모국 (&기지국)",
  scanStation: "집중국",
  siteName: "Site명",
  notes: "문제점 세부내역 및 대책방안",
};

describe("FIELD_RULES", () => {
  it("27개이고 id가 모두 다르다", () => {
    expect(FIELD_RULES).toHaveLength(27);
    expect(new Set(FIELD_RULES.map((r) => r.id)).size).toBe(27);
  });

  it("열 번호의 머리글이 표와 같다", () => {
    for (const rule of FIELD_RULES) {
      expect(DETAIL_COLUMNS[rule.column].header, rule.id).toBe(EXPECTED_HEADERS[rule.id]);
    }
  });

  it("그룹 개수가 identity 3 · sure 16 · convert 6 · mixed 2다", () => {
    const count = (g: string) => FIELD_RULES.filter((r) => r.group === g).length;
    expect(count("identity")).toBe(3);
    expect(count("sure")).toBe(16);
    expect(count("convert")).toBe(6);
    expect(count("mixed")).toBe(2);
  });

  it("notes와 siteName만 기본 꺼짐이다", () => {
    const off = FIELD_RULES.filter((r) => !r.defaultEnabled).map((r) => r.id);
    expect(off.sort()).toEqual(["notes", "siteName"]);
  });

  it("모국 칸은 모국명과 상위국명 위치를 가진다", () => {
    expect(FIELD_BY_ID.mokuk.sources.mokukName).toEqual({ section: 4, label: "모국명", direction: "below" });
    expect(FIELD_BY_ID.mokuk.sources.upperName).toEqual({
      section: 4,
      label: "(LTE)전송로 상위국명",
      direction: "below",
    });
  });
});

describe("DEFAULT_SETTINGS", () => {
  it("알려진 방식 목록이 5개다", () => {
    expect(DEFAULT_SETTINGS.knownModes).toEqual(["광중계기", "광분산", "기지국", "터널", "인빌딩"]);
  });

  it("인빌딩 방식 규칙은 useMokukOnly와 규칙 2개(철탑 형태·장비위치)다", () => {
    expect(DEFAULT_SETTINGS.modeRules).toHaveLength(1);
    const rule = DEFAULT_SETTINGS.modeRules[0];
    expect(rule.mode).toBe("인빌딩");
    expect(rule.useMokukOnly).toBe(true);
    expect(rule.rules.map((r) => r.field).sort()).toEqual(["equipPlace", "towerType"]);
  });

  it("치환표 기본값에 NW구조혁신이 들어 있다", () => {
    expect(DEFAULT_SETTINGS.fields.midCategory.aliases).toEqual([{ from: "NW구조혁신", to: "NW슬림화" }]);
    expect(DEFAULT_SETTINGS.fields.sharer.aliases).toEqual([{ from: "LGT", to: "LGU+" }]);
    expect(DEFAULT_SETTINGS.fields.method.aliases).toEqual([{ from: "인빌딩", to: "광분산" }]);
  });

  it("칸의 enabled는 규칙의 defaultEnabled를 따른다", () => {
    expect(DEFAULT_SETTINGS.fields.notes.enabled).toBe(false);
    expect(DEFAULT_SETTINGS.fields.siteName.enabled).toBe(false);
    expect(DEFAULT_SETTINGS.fields.year.enabled).toBe(true);
  });
});
