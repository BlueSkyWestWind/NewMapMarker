import { describe, expect, it, vi } from "vitest";
import { preventSelfAction, validateAdminUser } from "./admin-auth";

describe("admin-auth 유틸리티", () => {
  describe("preventSelfAction", () => {
    it("본인 ID와 대상 ID가 다르면 null(통과)을 반환한다", () => {
      expect(preventSelfAction("user-1", "user-2", "delete")).toBeNull();
      expect(preventSelfAction("user-1", "user-2", "demote")).toBeNull();
    });

    it("본인 계정을 삭제하려 하면 오류 응답을 반환한다", () => {
      const res = preventSelfAction("user-1", "user-1", "delete");
      expect(res).not.toBeNull();
      expect(res?.status).toBe(400);
      expect(res?.error).toContain("본인 계정");
    });

    it("본인 관리자 권한을 해제하려 하면 오류 응답을 반환한다", () => {
      const res = preventSelfAction("user-1", "user-1", "demote");
      expect(res).not.toBeNull();
      expect(res?.status).toBe(400);
      expect(res?.error).toContain("본인");
    });
  });

  describe("validateAdminUser", () => {
    it("getUser가 실패하면 401을 반환한다", async () => {
      const mockAnon = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("invalid") }),
        },
      } as unknown as Parameters<typeof validateAdminUser>[1];
      const mockAdmin = {} as Parameters<typeof validateAdminUser>[2];

      const result = await validateAdminUser("invalid-token", mockAnon, mockAdmin);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });

    it("관리자 테이블에 없으면 403을 반환한다", async () => {
      const mockAnon = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "user-normal", email: "user@test.com" } },
            error: null,
          }),
        },
      } as unknown as Parameters<typeof validateAdminUser>[1];

      const mockAdmin = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      } as unknown as Parameters<typeof validateAdminUser>[2];

      const result = await validateAdminUser("valid-token", mockAnon, mockAdmin);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(403);
      }
    });

    it("관리자 테이블에 있으면 ok와 사용자 정보를 반환한다", async () => {
      const mockAnon = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "user-admin", email: "admin@test.com" } },
            error: null,
          }),
        },
      } as unknown as Parameters<typeof validateAdminUser>[1];

      const mockAdmin = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: "user-admin" }, error: null }),
            }),
          }),
        }),
      } as unknown as Parameters<typeof validateAdminUser>[2];

      const result = await validateAdminUser("valid-token", mockAnon, mockAdmin);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.user.id).toBe("user-admin");
      }
    });
  });
});
