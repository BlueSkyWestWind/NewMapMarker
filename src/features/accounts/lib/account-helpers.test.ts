import { describe, expect, it } from "vitest";
import { describeCreateResult, formatAccountDateTime, isCurrentUser } from "./account-helpers";

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

describe("describeCreateResult", () => {
  const user = {
    id: "u1",
    email: "a@b.c",
    createdAt: "2026-11-08T00:00:00.000Z",
    lastSignInAt: null,
    isAdmin: false,
  };

  it("경고가 없으면 성공 문구를 짧게 보인다", () => {
    expect(describeCreateResult({ user })).toEqual({
      text: "새 계정이 생성되었습니다.",
      type: "success",
      durationMs: 3500,
    });
  });

  it("경고가 있으면 오류로 표시하고 경고 문구를 그대로 보여 더 오래 둔다", () => {
    const result = describeCreateResult({
      user,
      warning: "계정은 생성되었으나 관리자 권한 부여에 실패했습니다.",
    });
    expect(result.type).toBe("error");
    expect(result.text).toContain("관리자 권한 부여에 실패했습니다");
    expect(result.durationMs).toBeGreaterThan(3500);
  });

  it("빈 경고 문자열은 경고로 보지 않는다", () => {
    expect(describeCreateResult({ user, warning: "" }).type).toBe("success");
  });
});

