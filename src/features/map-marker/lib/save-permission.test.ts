import { describe, expect, it } from "vitest";
import { needsAdminToSave } from "./save-permission";

describe("needsAdminToSave", () => {
  it("기존 마커를 수정 저장할 때는 관리자가 아니면 막는다(지우고 다시 넣는 저장이라 삭제 권한이 필요하다)", () => {
    expect(needsAdminToSave({ selectedMarkerId: "m1", isAdmin: false })).toBe(true);
  });

  it("관리자는 기존 마커를 저장할 수 있다", () => {
    expect(needsAdminToSave({ selectedMarkerId: "m1", isAdmin: true })).toBe(false);
  });

  it("새 마커 등록은 관리자가 아니어도 막지 않는다", () => {
    expect(needsAdminToSave({ selectedMarkerId: null, isAdmin: false })).toBe(false);
  });
});
