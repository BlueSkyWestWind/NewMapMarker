import { describe, expect, it } from "vitest";
import { isScheduleTableMissing } from "./table-missing";

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
