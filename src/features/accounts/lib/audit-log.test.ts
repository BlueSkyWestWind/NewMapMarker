import { describe, expect, it } from "vitest";
import { buildAuditRow, clientIpOf, describeAuditDetail, isAuditAction } from "./audit-log";

describe("buildAuditRow", () => {
  it("공백을 정리하고 빈 값은 빈 글·null 로 채운다", () => {
    const row = buildAuditRow({
      actorId: "a1",
      actorEmail: " admin@x.kr ",
      action: "account_create",
      targetId: "t1",
      targetEmail: undefined,
      ip: "  ",
    });
    expect(row).toEqual({
      actor_id: "a1",
      actor_email: "admin@x.kr",
      action: "account_create",
      target_id: "t1",
      target_email: "",
      detail: {},
      ip: null,
    });
  });

  it("상세와 IP 를 그대로 담는다", () => {
    const row = buildAuditRow({
      actorId: null,
      actorEmail: "a@x.kr",
      action: "admin_grant",
      targetId: "t",
      targetEmail: "t@x.kr",
      detail: { isAdmin: true },
      ip: "203.0.113.5",
    });
    expect(row.detail).toEqual({ isAdmin: true });
    expect(row.ip).toBe("203.0.113.5");
  });
});

describe("clientIpOf", () => {
  it("cf-connecting-ip 를 먼저, 없으면 x-forwarded-for 첫 값, 그다음 x-real-ip", () => {
    expect(clientIpOf(new Headers({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIpOf(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIpOf(new Headers({ "x-real-ip": "4.4.4.4" }))).toBe("4.4.4.4");
    expect(clientIpOf(new Headers())).toBeNull();
  });
});

describe("isAuditAction / describeAuditDetail", () => {
  it("정해진 종류만 통과한다", () => {
    expect(isAuditAction("account_delete")).toBe(true);
    expect(isAuditAction("login")).toBe(false);
    expect(isAuditAction(null)).toBe(false);
  });

  it("계정 생성 상세를 읽기 쉽게 풀어 준다", () => {
    expect(describeAuditDetail("account_create", { isAdmin: true })).toBe("관리자 계정으로 생성");
    expect(describeAuditDetail("account_create", { isAdmin: false })).toBe("일반 계정으로 생성");
    expect(describeAuditDetail("account_create", { isAdmin: true, warning: "x" })).toContain("권한 부여 실패");
    expect(describeAuditDetail("admin_grant", {})).toBe("");
  });
});
