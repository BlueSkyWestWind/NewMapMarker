import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapMarkerExcelManager } from "./index";

/**
 * 엑셀 데이터 매니저 **특성화 테스트** — 현재 동작을 고정한다(옳고 그름을 판정하지 않는다).
 * 엄격 타입 전환(Ver 2.3)이 런타임 동작을 바꾸지 않았음을 증명하는 안전망이다.
 *
 * 파서는 브라우저 `FileReader`를 쓰므로 Node 테스트 환경에서는 최소한으로 대체한다.
 */
class FakeFileReader {
  onload: ((event: { target: { result: ArrayBuffer } }) => void) | null = null;
  onerror: (() => void) | null = null;

  readAsArrayBuffer(file: File) {
    file
      .arrayBuffer()
      .then((buffer) => this.onload?.({ target: { result: buffer } }))
      .catch(() => this.onerror?.());
  }
}

/** Excel이 만드는 CSV처럼 UTF-8 BOM을 붙인다(한글 헤더 인식에 필요). */
const BOM = "﻿";
const csv = (text: string, { bom = true }: { bom?: boolean } = {}) =>
  new File([(bom ? BOM : "") + text], "test.csv", { type: "text/csv" });

const parse = (text: string, options?: { bom?: boolean }) =>
  MapMarkerExcelManager.parseExcelOrCSV(csv(text, options)) as Promise<
    Record<string, unknown>[]
  >;

/** 매 실행마다 달라지는 값(id, 등록일)을 걷어 낸다. */
const stable = (rows: Record<string, unknown>[]) =>
  rows.map(({ id: _id, createdAt: _createdAt, ...rest }) => rest);

beforeEach(() => {
  vi.stubGlobal("FileReader", FakeFileReader);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseExcelOrCSV", () => {
  it("한글 헤더 CSV를 장비 행으로 파싱한다", async () => {
    const rows = await parse("이름,위도,경도,메모,태그\nA국소,37.5,127.0,비고1,a|b\n");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "A국소",
      lat: 37.5,
      lng: 127,
      memo: "비고1",
      tags: ["a", "b"],
      facilityTeam: "",
      color: "#10b981",
    });
    expect(String(rows[0].id)).toMatch(/^marker_/);
  });

  it("BOM 없는 UTF-8 한글 CSV는 헤더를 인식하지 못해 거부된다 (알려진 한계)", async () => {
    await expect(
      parse("이름,위도,경도\nA국소,37.5,127.0\n", { bom: false }),
    ).rejects.toThrow("장소 이름에 해당하는 열");
  });

  it("빈 셀은 undefined가 아니라 빈 문자열/빈 배열로 남는다", async () => {
    const [row] = await parse("이름,위도,경도,메모\nA국소,37.5,127.0,\n");

    expect(row.memo).toBe("");
    expect(row.tags).toEqual([]);
    expect(row.facilityCode).toBe("");
    expect(row.installDate).toBe("");
    expect(row.openDate).toBe("");
  });

  it("좌표 문자열의 앞뒤 공백은 숫자로 변환된다", async () => {
    const [row] = await parse('이름,위도,경도\nA국소," 37.5 "," 127.0 "\n');
    expect(row.lat).toBe(37.5);
    expect(row.lng).toBe(127);
  });

  it("헤더만 있고 데이터가 없으면 '데이터가 없습니다'로 거부된다", async () => {
    await expect(parse("이름,위도,경도\n")).rejects.toThrow("엑셀 파일에 데이터가 없습니다");
  });

  it("이름 열이 없으면 거부된다", async () => {
    await expect(parse("위도,경도\n37.5,127.0\n")).rejects.toThrow("장소 이름에 해당하는 열");
  });

  it("위치 열(위경도·주소)이 없으면 거부된다", async () => {
    await expect(parse("이름,메모\nA,x\n")).rejects.toThrow("위치 정보에 해당하는 열");
  });

  it("좌표도 주소도 없는 행과 이름이 빈 행은 건너뛴다", async () => {
    const noLocation = await parse("이름,위도,경도\nA국소,37.5,127.0\nB국소,,\n");
    expect(noLocation.map((r) => r.name)).toEqual(["A국소"]);

    const blankName = await parse("이름,위도,경도\n,37.5,127.0\nA국소,37.6,127.1\n");
    expect(blankName.map((r) => r.name)).toEqual(["A국소"]);
  });

  it("주소만 있는 행은 address를 싣고 도로명/지번을 구분해 담는다", async () => {
    const rows = await parse(
      "이름,주소\nA국소,광주광역시 북구 첨단로 123\nB국소,광주광역시 북구 두암동 123-4\n",
    );

    expect(rows[0]).toMatchObject({
      address: "광주광역시 북구 첨단로 123",
      roadAddress: "광주광역시 북구 첨단로 123",
      jibunAddress: "",
    });
    expect(rows[0]).not.toHaveProperty("lat");
    expect(rows[1]).toMatchObject({
      address: "광주광역시 북구 두암동 123-4",
      roadAddress: "",
      jibunAddress: "광주광역시 북구 두암동 123-4",
    });
  });

  it("시설팀이 있으면 팀 색, 없으면 유효한 Hex 색, 둘 다 아니면 기본 색", async () => {
    const rows = await parse(
      "이름,위도,경도,시설팀,색상\n" +
        "A국소,37.5,127.0,2팀,#ff0000\n" +
        "B국소,37.6,127.1,,#ff0000\n" +
        "C국소,37.7,127.2,,red\n",
    );

    expect(rows.map((r) => [r.facilityTeam, r.color])).toEqual([
      ["2", "#d946ef"],
      ["", "#ff0000"],
      ["", "#10b981"],
    ]);
  });

  it("행 전체 구조가 고정돼 있다 (id·등록일 제외)", async () => {
    const rows = await parse("이름,위도,경도\nA국소,37.5,127.0\n");

    expect(stable(rows)).toEqual([
      {
        name: "A국소",
        memo: "",
        tags: [],
        facilityTeam: "",
        color: "#10b981",
        facilityCode: "",
        projectCode: "",
        facilityYear: "",
        businessType: "",
        finalStationName: "",
        eqClass: "",
        eqType: "",
        installDate: "",
        openDate: "",
        roadAddress: "",
        jibunAddress: "",
        lat: 37.5,
        lng: 127,
      },
    ]);
  });
});

describe("parseInfoExcel", () => {
  const parseInfo = (text: string) =>
    MapMarkerExcelManager.parseInfoExcel(csv(text)) as Promise<Record<string, unknown>[]>;

  it("정보 행을 snake_case 필드로 파싱하고 안내 행·빈 행은 건너뛴다", async () => {
    const rows = await parseInfo(
      "통합시설코드,프로젝트코드,시설연도,사업구분,장소이름,장비분류,장비타입\n" +
        "F-001,P-1,2024,신설,A국소,AMP,RRU\n" +
        "작성 안내,,,,,,\n" +
        ",,,,,,\n",
    );

    expect(rows).toEqual([
      {
        facility_code: "F-001",
        project_code: "P-1",
        facility_year: "2024",
        business_type: "신설",
        place_name: "A국소",
        final_station_name: "",
        eq_class: "AMP",
        eq_type: "RRU",
        install_date: "",
        open_date: "",
        marker_id: "",
      },
    ]);
  });

  it("통합시설코드 열이 없으면 거부된다", async () => {
    await expect(parseInfo("프로젝트코드\nP-1\n")).rejects.toThrow("통합시설코드 열을 찾을 수 없습니다");
  });
});

describe("formatDateToYmd", () => {
  const fmt = (value: unknown) => MapMarkerExcelManager.formatDateToYmd(value) as string;

  it("비어 있는 값은 빈 문자열", () => {
    expect(fmt(null)).toBe("");
    expect(fmt(undefined)).toBe("");
    expect(fmt("   ")).toBe("");
  });

  it("구분자·자리수가 다른 날짜를 yyyy-mm-dd로 맞춘다", () => {
    expect(fmt("2024.3.5")).toBe("2024-03-05");
    expect(fmt("2024/3/5")).toBe("2024-03-05");
    expect(fmt("20240305")).toBe("2024-03-05");
    expect(fmt("24-03-05")).toBe("2024-03-05");
    expect(fmt("2024-03-05T10:00:00")).toBe("2024-03-05");
  });

  it("Date 객체는 로컬 날짜 기준으로 변환한다", () => {
    expect(fmt(new Date(2024, 2, 5))).toBe("2024-03-05");
    expect(fmt(new Date("invalid"))).toBe("");
  });

  it("유효 범위(1980~현재+10년) 밖이거나 날짜가 아니면 원문을 돌려준다", () => {
    expect(fmt("1970-01-01")).toBe("1970-01-01");
    expect(fmt("hello")).toBe("hello");
  });
});

describe("parseFacilityTeamInput / getFacilityTeamExportLabel", () => {
  it("팀 번호·라벨·'N팀…' 접두를 같은 팀으로 본다", async () => {
    const { parseFacilityTeamInput } = await import("./shared");
    expect(parseFacilityTeamInput("2")).toEqual({ facilityTeam: "2", color: "#d946ef" });
    expect(parseFacilityTeamInput("2팀(김정배)")).toEqual({ facilityTeam: "2", color: "#d946ef" });
    expect(parseFacilityTeamInput("2팀 어쩌고")).toEqual({ facilityTeam: "2", color: "#d946ef" });
  });

  it("알 수 없거나 비어 있으면 팀 없음 + 회색", async () => {
    const { parseFacilityTeamInput } = await import("./shared");
    expect(parseFacilityTeamInput("")).toEqual({ facilityTeam: "", color: "#64748b" });
    expect(parseFacilityTeamInput("9팀")).toEqual({ facilityTeam: "", color: "#64748b" });
  });

  it("내보내기 라벨: 없는 팀은 빈 문자열", async () => {
    const { getFacilityTeamExportLabel } = await import("./shared");
    expect(getFacilityTeamExportLabel("1")).toBe("1팀(박경훈)");
    expect(getFacilityTeamExportLabel("99")).toBe("");
  });
});
