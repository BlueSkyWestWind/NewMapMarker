import { describe, expect, it } from "vitest";
import {
  isNoCompanionColumnMissing,
  isResultColumnMissing,
  isScheduleTableMissing,
} from "./table-missing";

describe("isScheduleTableMissing", () => {
  it("테이블이 없다는 코드를 알아본다", () => {
    expect(isScheduleTableMissing({ code: "42P01" })).toBe(true);
    expect(isScheduleTableMissing({ code: "PGRST205" })).toBe(true);
  });

  it("메시지에 테이블 이름과 없음이 있으면 알아본다", () => {
    expect(
      isScheduleTableMissing({ message: 'relation "public.schedule_cells" does not exist' }),
    ).toBe(true);
    expect(
      isScheduleTableMissing({
        message: "Could not find the table 'public.schedule_cells' in the schema cache",
      }),
    ).toBe(true);
  });

  it("권한 오류나 다른 오류는 아니다", () => {
    expect(isScheduleTableMissing({ code: "42501" })).toBe(false);
    expect(isScheduleTableMissing({ message: 'relation "public.markers" does not exist' })).toBe(
      false,
    );
  });

  it("오류 객체가 아니면 false다", () => {
    expect(isScheduleTableMissing(null)).toBe(false);
    expect(isScheduleTableMissing("42P01")).toBe(false);
    expect(isScheduleTableMissing(undefined)).toBe(false);
  });
});

describe("isResultColumnMissing", () => {
  it("컬럼이 없다는 코드·메시지를 알아본다", () => {
    expect(isResultColumnMissing({ code: "42703" })).toBe(true);
    expect(
      isResultColumnMissing({ message: "column schedule_cells.result_status does not exist" }),
    ).toBe(true);
  });

  it("다른 오류는 아니다", () => {
    expect(isResultColumnMissing({ code: "42501" })).toBe(false);
    expect(isResultColumnMissing({ message: "column markers.foo does not exist" })).toBe(false);
    expect(isResultColumnMissing(null)).toBe(false);
  });
});

describe("isNoCompanionColumnMissing", () => {
  it("no_companion 컬럼이 없다는 Postgres·PostgREST 메시지를 알아본다", () => {
    expect(
      isNoCompanionColumnMissing({
        code: "42703",
        message: "column schedule_cells.no_companion does not exist",
      }),
    ).toBe(true);
    expect(
      isNoCompanionColumnMissing({
        code: "PGRST204",
        message: "Could not find the 'no_companion' column of 'schedule_cells' in the schema cache",
      }),
    ).toBe(true);
  });

  it("다른 컬럼의 오류나 컬럼 이름이 없는 오류는 아니다", () => {
    expect(isNoCompanionColumnMissing({ code: "42703" })).toBe(false);
    expect(
      isNoCompanionColumnMissing({ message: "column schedule_cells.result_status does not exist" }),
    ).toBe(false);
    expect(isNoCompanionColumnMissing(null)).toBe(false);
  });
});
