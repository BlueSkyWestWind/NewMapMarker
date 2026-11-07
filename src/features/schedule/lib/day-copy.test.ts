import { describe, expect, it } from "vitest";
import { DAY_COLUMNS } from "./day-columns";
import { buildCopyText } from "./day-copy";
import { DAY_COLUMN_KEYS, type DayValues } from "./day-types";

function makeValues(overrides: Partial<DayValues> = {}): DayValues {
  const base = Object.fromEntries(DAY_COLUMN_KEYS.map((key) => [key, ""])) as DayValues;
  return { ...base, ...overrides };
}

describe("buildCopyText", () => {
  it("24칸을 DAY_COLUMNS 순서로 탭으로 잇고 제목 줄이 없다", () => {
    const values = makeValues({ seq: "1", project: "5G", site: "동문동", workDate: "2026-11-09", workDetail: "끝" });
    const text = buildCopyText([values]);
    const cells = text.split("\t");

    expect(cells).toHaveLength(24);
    expect(cells).toEqual(DAY_COLUMNS.map((column) => values[column.key]));
    expect(cells[0]).toBe("1");
    expect(cells[1]).toBe("5G");
    expect(cells[8]).toBe("동문동");
    expect(cells[10]).toBe("2026-11-09");
    expect(cells[23]).toBe("끝");
    expect(text).not.toContain("\n");
    expect(text).not.toContain("순번");
  });

  it("행은 줄바꿈(LF)으로 잇고 끝에 줄바꿈을 붙이지 않는다", () => {
    const text = buildCopyText([makeValues({ seq: "1" }), makeValues({ seq: "2" })]);
    const lines = text.split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith("1\t")).toBe(true);
    expect(lines[1].startsWith("2\t")).toBe(true);
    expect(text.endsWith("\n")).toBe(false);
  });

  it("빈 값은 빈칸으로 남는다", () => {
    const text = buildCopyText([makeValues()]);

    expect(text).toBe("\t".repeat(23));
  });

  it("값 안의 탭·줄바꿈은 공백으로 바꾼다", () => {
    const values = makeValues({ workDetail: "가\t나\r\n다\n라\r마" });
    const line = buildCopyText([values]);
    const cells = line.split("\t");

    expect(line.split("\n")).toHaveLength(1);
    expect(cells).toHaveLength(24);
    expect(cells[23]).toBe("가 나  다 라 마");
  });

  it("중장비투입의 쉼표는 그대로 두고 열이 늘지 않는다", () => {
    const values = makeValues({ equipment: "이동식크레인,굴착기", worker: "홍길동,김철수" });
    const line = buildCopyText([values]);
    const cells = line.split("\t");

    expect(line.split("\t").length - 1).toBe(23);
    expect(cells[21]).toBe("이동식크레인,굴착기");
    expect(cells[13]).toBe("홍길동,김철수");
  });

  it("행이 없으면 빈 글이다", () => {
    expect(buildCopyText([])).toBe("");
  });
});
