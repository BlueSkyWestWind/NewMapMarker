import { describe, expect, it } from "vitest";
import { formatRefreshSummary } from "./refresh-message";

const base = { refreshed: 0, recent: 0, failed: 0, unsaved: 0, alertsRefreshed: true };

describe("formatRefreshSummary", () => {
  it("갱신과 건너뜀을 한 문장으로", () => {
    expect(formatRefreshSummary({ ...base, refreshed: 12, recent: 3 })).toBe("12곳 갱신, 3곳은 5분 안에 갱신돼 건너뜀");
  });

  it("모두 건너뛰면 새로 받은 곳이 없다고 알린다", () => {
    expect(formatRefreshSummary({ ...base, recent: 5 })).toBe("새로 받은 곳 없음, 5곳은 5분 안에 갱신돼 건너뜀");
  });

  it("받지 못한 곳과 저장하지 못한 곳을 알린다", () => {
    expect(formatRefreshSummary({ ...base, refreshed: 2, failed: 1, unsaved: 2 })).toBe(
      "2곳 갱신, 1곳은 받지 못함, 2곳은 저장하지 못해 이전 값이 보입니다",
    );
  });

  it("특보를 새로 받지 못했으면 덧붙인다", () => {
    expect(formatRefreshSummary({ ...base, refreshed: 1, alertsRefreshed: false })).toBe("1곳 갱신, 특보는 새로 받지 못함");
  });
});
