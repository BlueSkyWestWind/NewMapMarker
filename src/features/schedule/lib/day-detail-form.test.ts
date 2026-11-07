import { describe, expect, it } from "vitest";
import { buildDetailPatches, emptyForm, formFromValues, type DetailForm } from "./day-detail-form";
import { DAY_COLUMN_KEYS, type DayValues } from "./day-types";
import type { DayRow } from "./day-rows";

function values(overrides: Partial<DayValues> = {}): DayValues {
  const base = Object.fromEntries(DAY_COLUMN_KEYS.map((key) => [key, ""])) as DayValues;
  return { ...base, workCategory: "HW", levelLabel: "Level1", workTime: "주간", project: "자동 프로젝트", ...overrides };
}

function row(stationKey: string, overrides: Partial<DayValues> = {}): DayRow {
  return { stationKey, site: stationKey.toUpperCase(), values: values(overrides), refSource: "erp" };
}

function edited(base: DetailForm, changes: Partial<DetailForm>): DetailForm {
  return { ...base, ...changes };
}

describe("buildDetailPatches - 한 행", () => {
  const target = row("a");

  it("아무것도 바꾸지 않으면 패치를 만들지 않는다", () => {
    expect(buildDetailPatches([target], formFromValues(target.values))).toEqual([]);
  });

  it("바뀐 칸만 담는다", () => {
    const form = edited(formFromValues(target.values), { workTime: "야간", worker: "홍길동" });
    expect(buildDetailPatches([target], form)).toEqual([
      { station: target, patch: { workTime: "야간", worker: "홍길동" } },
    ]);
  });

  it("값을 지운 입력 칸은 지움(빈 글)으로 보낸다", () => {
    const row1 = row("a", { workType: "실외" });
    const form = edited(formFromValues(row1.values), { workType: "" });
    expect(buildDetailPatches([row1], form)[0]?.patch).toEqual({ workType: "" });
  });

  it("글자 앞뒤 공백은 잘라 보내고, 공백만 바꾼 칸은 바뀐 것으로 보지 않는다", () => {
    const form = edited(formFromValues(target.values), { workDetail: "  상세  ", signaler: "   " });
    expect(buildDetailPatches([target], form)[0]?.patch).toEqual({ workDetail: "상세" });
  });

  it("공백만 있던 칸을 그대로 두면(편집 안 함) 보내지 않는다", () => {
    const row1 = row("a", { witness: " " });
    expect(buildDetailPatches([row1], formFromValues(row1.values))).toEqual([]);
  });

  it("바뀐 참조 열은 overrides에 담는다", () => {
    const form = edited(formFromValues(target.values), { project: "내 프로젝트", region: "서울" });
    expect(buildDetailPatches([target], form)[0]?.patch).toEqual({
      overrides: { project: "내 프로젝트", region: "서울" },
    });
  });

  it("참조 열을 비우면 overrides 값을 빈 글로 보낸다(덮어쓰기를 지워 자동값으로 돌아가게)", () => {
    const form = edited(formFromValues(target.values), { project: "" });
    expect(buildDetailPatches([target], form)[0]?.patch).toEqual({ overrides: { project: "" } });
  });

  it("바꾸지 않은 참조 열은 overrides에 넣지 않는다(자동값을 덮어쓰기로 굳히지 않는다)", () => {
    const form = edited(formFromValues(target.values), { workTime: "야간" });
    expect(buildDetailPatches([target], form)[0]?.patch).not.toHaveProperty("overrides");
  });
});

describe("buildDetailPatches - 여러 행(일괄)", () => {
  const rows = [row("a", { workTime: "주간" }), row("b", { workTime: "야간", workType: "실외" })];

  it("채운 칸이 없으면 패치를 만들지 않는다", () => {
    expect(buildDetailPatches(rows, emptyForm())).toEqual([]);
  });

  it("채운 칸만 모든 행에 똑같이 적용한다", () => {
    const form = edited(emptyForm(), { workContent: "장비설치", equipment: "굴착기" });
    const result = buildDetailPatches(rows, form);
    expect(result.map((item) => item.station)).toEqual(rows);
    for (const item of result) expect(item.patch).toEqual({ workContent: "장비설치", equipment: "굴착기" });
  });

  it("공백만 채운 칸은 비운 것으로 본다", () => {
    const form = edited(emptyForm(), { workTime: "  ", workDetail: " 야간 공사 " });
    expect(buildDetailPatches(rows, form)[0]?.patch).toEqual({ workDetail: "야간 공사" });
  });

  it("일괄 모드는 작업자·입회자·신호수·작업구분(S)·참조 열을 건드리지 않는다", () => {
    const form = edited(emptyForm(), {
      workCategory: "접속",
      worker: "홍길동",
      witness: "김입회",
      signaler: "박신호",
      levelLabel: "Level2",
      project: "무시",
    });
    expect(buildDetailPatches(rows, form)[0]?.patch).toEqual({ workCategory: "접속" });
  });

  it("행이 하나뿐이면 한 행 규칙을 따른다(채워진 폼 기준)", () => {
    const single = [row("a")];
    const form = edited(formFromValues(single[0]!.values), { workTime: "야간" });
    expect(buildDetailPatches(single, form)[0]?.patch).toEqual({ workTime: "야간" });
  });
});
