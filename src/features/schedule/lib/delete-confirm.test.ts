import { describe, expect, it } from "vitest";
import { deleteConfirmMessage } from "./delete-confirm";

describe("deleteConfirmMessage", () => {
  it("0건 삭제이면 null을 돌려준다", () => {
    expect(deleteConfirmMessage({ deleteCount: 0, isClearAll: false })).toBeNull();
    expect(deleteConfirmMessage({ deleteCount: 0, isClearAll: true })).toBeNull();
  });

  it("전체 삭제가 아닌 1건 삭제는 확인 없이 null을 돌려준다", () => {
    expect(deleteConfirmMessage({ deleteCount: 1, isClearAll: false })).toBeNull();
  });

  it("2건 이상 삭제이면 건수를 담은 확인 문구를 돌려준다", () => {
    expect(deleteConfirmMessage({ deleteCount: 2, isClearAll: false })).toBe("2건을 삭제합니다. 계속할까요?");
    expect(deleteConfirmMessage({ deleteCount: 5, isClearAll: false })).toBe("5건을 삭제합니다. 계속할까요?");
  });

  it("전체 삭제이면 1건이어도 확인 문구를 돌려준다", () => {
    expect(deleteConfirmMessage({ deleteCount: 1, isClearAll: true })).toBe("1건을 삭제합니다. 계속할까요?");
    expect(deleteConfirmMessage({ deleteCount: 3, isClearAll: true })).toBe("3건을 삭제합니다. 계속할까요?");
  });
});
