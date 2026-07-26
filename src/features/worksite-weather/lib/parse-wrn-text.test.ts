import { describe, expect, it } from "vitest";
import { matchesRegion, parseWrnNowText } from "./parse-wrn-text";

/**
 * 2026-07-26 실응답에서 그대로 가져온 형식.
 * 헤더는 공백 구분 + 하이픈 패딩, 데이터는 쉼표 구분 + 공백 패딩 + 줄 끝 '='.
 */
const HEADER =
  "# REG_UP  REG_UP_KO-------------------------------  REG_ID    REG_KO----------------------------------  TM_FC         TM_EF         WRN     LVL       CMD   ED_TM";

const PREAMBLE = [
  "#START7777",
  "#---------------------------------------------------------------",
  "#  특보현황 조회",
  "#  3. REG_ID    : 특보구역코드",
  "#  7. WRN       : 특보종류",
  "#---------------------------------------------------------------",
];

function row(regUpKo: string, regId: string, regKo: string, wrn: string, lvl: string, cmd: string): string {
  const pad = (v: string, n: number) => v + " ".repeat(Math.max(0, n - v.length));
  return `L1050000, ${pad(regUpKo, 32)}, ${regId}, ${pad(regKo, 38)}, 202607231300, 202607231400, ${pad(wrn, 6)}, ${pad(lvl, 8)}, ${cmd},  ,=`;
}

function body(...rows: string[]): string {
  return [...PREAMBLE, HEADER, ...rows, "#7777END"].join("\n");
}

describe("parseWrnNowText — 실응답 형식", () => {
  it("순천시 폭염경보를 읽는다 (실데이터 재현)", () => {
    const text = body(row("전라남도", "L1051200", "순천시", "폭염", "경보", "변경"));
    const { alerts, parsed } = parseWrnNowText(text, "전라남도 순천시 조례동 123-4");

    expect(parsed).toBe(true);
    expect(alerts).toEqual([
      { type: "폭염", level: "경보", region: "순천시", issuedAt: "202607231400" },
    ]);
  });

  it("LVL '주의'를 통용 표기 '주의보'로 바꾼다", () => {
    const text = body(row("전라남도", "L1051200", "순천시", "폭염", "주의", "발표"));
    expect(parseWrnNowText(text, "순천시").alerts[0].level).toBe("주의보");
  });

  it("'중대경보'도 그대로 살린다", () => {
    const text = body(row("전라남도", "L1051100", "광양시", "폭염", "중대경보", "변경"));
    expect(parseWrnNowText(text, "광양시").alerts[0].level).toBe("중대경보");
  });

  it("해제·취소 명령은 발효 목록에서 뺀다", () => {
    const text = body(
      row("전라남도", "L1051200", "순천시", "폭염", "경보", "해제"),
      row("전라남도", "L1051200", "순천시", "호우", "주의", "취소"),
    );
    expect(parseWrnNowText(text, "순천시").alerts).toHaveLength(0);
  });

  it("발표·변경은 유효로 본다", () => {
    const text = body(
      row("전라남도", "L1051200", "순천시", "폭염", "경보", "발표"),
      row("전라남도", "L1051200", "순천시", "열대야", "주의", "변경"),
    );
    expect(parseWrnNowText(text, "순천시").alerts.map((a) => a.type)).toEqual([
      "폭염",
      "열대야",
    ]);
  });

  it("다른 시·군 특보는 걸러낸다", () => {
    const text = body(
      row("경상북도", "L1070500", "경산시", "폭염", "중대경보", "변경"),
      row("전라남도", "L1051200", "순천시", "폭염", "경보", "변경"),
      row("전라남도", "L1050600", "장성군", "폭염", "경보", "변경"),
    );
    const { alerts } = parseWrnNowText(text, "전라남도 순천시 조례동");

    expect(alerts).toHaveLength(1);
    expect(alerts[0].region).toBe("순천시");
  });

  it("같은 도의 다른 시·군까지 끌어오지 않는다", () => {
    const text = body(row("전라남도", "L1050600", "장성군", "폭염", "경보", "변경"));
    expect(parseWrnNowText(text, "전라남도 순천시 조례동").alerts).toHaveLength(0);
  });

  it("태풍 특보를 식별한다 — 태풍 배너 노출 조건", () => {
    const text = body(row("전라남도", "L1051200", "순천시", "태풍", "주의", "발표"));
    expect(parseWrnNowText(text, "순천시").alerts[0].type).toBe("태풍");
  });

  it("발효 특보가 없으면 빈 목록이지만 해석은 성공", () => {
    expect(parseWrnNowText(body(), "순천시")).toEqual({ alerts: [], parsed: true });
  });

  it("헤더가 없으면 문서상 컬럼 순서로 폴백한다", () => {
    const text = [
      "#START7777",
      row("전라남도", "L1051200", "순천시", "폭염", "경보", "변경"),
      "#7777END",
    ].join("\n");
    expect(parseWrnNowText(text, "순천시").alerts).toHaveLength(1);
  });

  it("형식이 어긋나면 값을 지어내지 않고 parsed=false", () => {
    const text = ["#START7777", "a,b", "c,d", "#7777END"].join("\n");
    const { alerts, parsed } = parseWrnNowText(text, "순천시");

    expect(alerts).toHaveLength(0);
    expect(parsed).toBe(false);
  });

  it("빈 응답(EUC-KR 디코드 실패 포함)은 parsed=false", () => {
    expect(parseWrnNowText("", "순천시")).toEqual({ alerts: [], parsed: false });
  });

  it("주소를 모르면 전국 특보를 몰아 적용하지 않고 확인 불가로 낸다", () => {
    const text = body(
      row("전라남도", "L1051200", "순천시", "폭염", "경보", "변경"),
      row("강원특별자치도", "L1010100", "춘천시", "호우", "주의", "발표"),
    );
    // 전국 372건이 그대로 통과하면 타 지역 호우주의보 하나로 작업중지가 떠버린다
    expect(parseWrnNowText(text, "")).toEqual({ alerts: [], parsed: false });
  });
});

describe("matchesRegion — 도(道)", () => {
  it("시·군 이름이 주소에 있으면 일치", () => {
    expect(matchesRegion("순천시", "전라남도", "전라남도 순천시 조례동")).toBe(true);
  });

  it("시·군이 다르면 상위 도가 같아도 불일치", () => {
    expect(matchesRegion("장성군", "전라남도", "전라남도 순천시 조례동")).toBe(false);
  });

  it("전남 ↔ 전라남도 축약 표기를 잡는다", () => {
    expect(matchesRegion("순천시", "전라남도", "전남 순천시 조례동")).toBe(true);
  });

  it("특보구역이 도 전역이면 시·군을 따지지 않는다", () => {
    expect(matchesRegion("", "전라남도", "전남 순천시 조례동")).toBe(true);
  });
});

describe("matchesRegion — 광역시·특별시", () => {
  // 광역시 특보구역은 '광주서부'·'광주동부'처럼 시 내부 권역이라
  // 주소('광주광역시 북구')와 문자열이 겹치지 않는다. 놓치면 발효 중인 특보를 못 본다.
  it("권역명이 주소에 없어도 시가 같으면 일치 (회귀: 광주 폭염경보 누락)", () => {
    expect(matchesRegion("광주서부", "광주광역시", "광주광역시 북구 월출동 695-6")).toBe(true);
    expect(matchesRegion("광주동부", "광주광역시", "광주 북구 월출동")).toBe(true);
  });

  it("서울·부산도 같은 규칙", () => {
    expect(matchesRegion("서울동북권", "서울특별시", "서울특별시 성북구")).toBe(true);
    expect(matchesRegion("부산중부", "부산광역시", "부산 해운대구")).toBe(true);
  });
});

describe("matchesRegion — 동명 지역 혼동 방지", () => {
  it("경기도 광주시 특보가 광주광역시 국소에 뜨지 않는다", () => {
    expect(matchesRegion("광주시", "경기도", "광주광역시 북구 월출동")).toBe(false);
  });

  it("광주광역시 특보가 경기도 광주시 국소에 뜨지 않는다", () => {
    expect(matchesRegion("광주서부", "광주광역시", "경기도 광주시 역동")).toBe(false);
  });

  it("경기도 광주시 국소는 경기도 광주시 특보를 받는다", () => {
    expect(matchesRegion("광주시", "경기도", "경기도 광주시 역동")).toBe(true);
  });

  it("다른 도는 걸러낸다", () => {
    expect(matchesRegion("춘천시", "강원도", "전라남도 순천시 조례동")).toBe(false);
  });
});

describe("matchesRegion — 경계", () => {
  it("주소를 모르면 매칭하지 않는다 (전국 특보 몰아 적용 방지)", () => {
    expect(matchesRegion("춘천시", "강원도", "")).toBe(false);
  });

  it("주소에 시·도가 없으면 시·군 이름으로만 판단한다", () => {
    expect(matchesRegion("순천시", "전라남도", "순천시 조례동 123-4")).toBe(true);
    expect(matchesRegion("장성군", "전라남도", "순천시 조례동 123-4")).toBe(false);
  });
});
