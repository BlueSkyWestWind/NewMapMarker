import { describe, expect, it } from "vitest";

import { DAY_COLUMNS } from "@/features/schedule/lib/day-columns";
import { DAY_COLUMN_KEYS, REF_KEYS } from "@/features/schedule/lib/day-types";

describe("DAY_COLUMNS", () => {
  it("24열이고 키가 DAY_COLUMN_KEYS 순서와 같다", () => {
    expect(DAY_COLUMNS).toHaveLength(24);
    expect(DAY_COLUMNS.map((column) => column.key)).toEqual([...DAY_COLUMN_KEYS]);
  });

  it("머리글이 원본 순서이고 작업구분이 G·S 두 번 나온다", () => {
    expect(DAY_COLUMNS.map((column) => column.header)).toEqual([
      "순번",
      "프로젝트",
      "통합시설코드",
      "사업분류",
      "사업유형",
      "공사유형",
      "작업구분",
      "지역",
      "국소명",
      "장비타입",
      "작업일",
      "주소",
      "모국",
      "작업자",
      "입회자",
      "신호수",
      "부동산형태",
      "장비위치",
      "작업구분",
      "작업시간",
      "작업유형",
      "중장비투입",
      "작업내용",
      "작업내용 상세",
    ]);
  });

  it("열 문자가 A부터 X까지이다", () => {
    expect(DAY_COLUMNS.map((column) => column.letter).join("")).toBe("ABCDEFGHIJKLMNOPQRSTUVWX");
  });

  it("스펙에 있는 열 폭을 쓴다", () => {
    const width = (letter: string) => DAY_COLUMNS.find((column) => column.letter === letter)?.widthChars;
    expect(width("B")).toBe(17);
    expect(width("I")).toBe(45.875);
    expect(width("J")).toBe(33.875);
    expect(width("L")).toBe(45.625);
    expect(width("X")).toBe(25.125);
    expect(DAY_COLUMNS.every((column) => column.widthChars > 0)).toBe(true);
  });

  it("목록 열이 D·E·F·G·T·U·V·W이다", () => {
    const withList = DAY_COLUMNS.filter((column) => column.list !== undefined);
    expect(withList.map((column) => `${column.letter}:${column.list}`)).toEqual([
      "D:bizClass",
      "E:bizKind",
      "F:constructionType",
      "G:workCategory",
      "T:workTime",
      "U:workType",
      "V:equipment",
      "W:workContent",
    ]);
  });

  it("kind가 자동 6열·참조 11열·입력 7열이다", () => {
    const keysOf = (kind: string) => DAY_COLUMNS.filter((column) => column.kind === kind).map((column) => column.key);
    expect(keysOf("auto")).toEqual(["seq", "site", "workDate", "worker", "witness", "signaler"]);
    expect([...keysOf("ref")].sort()).toEqual([...REF_KEYS].sort());
    expect(keysOf("ref")).toHaveLength(11);
    expect(keysOf("input")).toEqual([
      "workCategory",
      "levelLabel",
      "workTime",
      "workType",
      "equipment",
      "workContent",
      "workDetail",
    ]);
  });
});
