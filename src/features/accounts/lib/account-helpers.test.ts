import { describe, expect, it } from "vitest";
import { formatAccountDateTime, isCurrentUser } from "./account-helpers";

describe("account-helpers", () => {
  describe("formatAccountDateTime", () => {
    it("null이나 빈 값이면 대시(-)를 반환한다", () => {
      expect(formatAccountDateTime(null)).toBe("-");
      expect(formatAccountDateTime("")).toBe("-");
    });

    it("ISO 날짜를 yyyy-mm-dd HH:mm 형식으로 포맷한다", () => {
      const formatted = formatAccountDateTime("2026-11-08T10:30:00.000Z");
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    });

    it("유효하지 않은 날짜 문자열이면 대시(-)를 반환한다", () => {
      expect(formatAccountDateTime("invalid-date")).toBe("-");
    });
  });

  describe("isCurrentUser", () => {
    it("현재 로그인 유저 ID와 대상 ID가 일치하면 true를 반환한다", () => {
      expect(isCurrentUser("user-1", "user-1")).toBe(true);
    });

    it("현재 유저 ID와 대상 ID가 다르면 false를 반환한다", () => {
      expect(isCurrentUser("user-1", "user-2")).toBe(false);
      expect(isCurrentUser(null, "user-2")).toBe(false);
      expect(isCurrentUser(undefined, "user-2")).toBe(false);
    });
  });
});
