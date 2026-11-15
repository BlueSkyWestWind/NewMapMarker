process.env.TZ = "Asia/Seoul";

import { describe, expect, it } from "vitest";
import { localDateIso } from "./local-date";

describe("localDateIso", () => {
  it("KST 자정 직후(00:00~08:59)에도 로컬 달력 기준 YYYY-MM-DD를 반환한다", () => {
    // 같은 입력에 옛 방식 toISOString().slice(0, 10)을 쓰면 UTC(전날)인
    // 2026-11-14, 2026-11-30, 2025-12-31이 나온다.
    expect(localDateIso(new Date(2026, 10, 15, 0, 30))).toBe("2026-11-15");
    expect(localDateIso(new Date(2026, 11, 1, 0, 30))).toBe("2026-12-01");
    expect(localDateIso(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  });

  it("하루 끝(23:59)에도 로컬 달력 기준 YYYY-MM-DD를 반환한다", () => {
    expect(localDateIso(new Date(2026, 10, 15, 23, 59))).toBe("2026-11-15");
  });
});
