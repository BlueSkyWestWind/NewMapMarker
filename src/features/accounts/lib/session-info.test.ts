import { describe, expect, it } from "vitest";
import {
  describeUserAgent,
  formatLastActive,
  formatSessionLine,
  isRecentlyActive,
  sortSessionsByActivity,
} from "./session-info";
import type { AdminSession } from "../types";

const CHROME_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const EDGE_WIN = `${CHROME_WIN} Edg/130.0.0.0`;
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("describeUserAgent", () => {
  it("브라우저/OS 를 알려 준다", () => {
    expect(describeUserAgent(CHROME_WIN)).toBe("Chrome/Windows");
    expect(describeUserAgent(EDGE_WIN)).toBe("Edge/Windows");
    expect(describeUserAgent(SAFARI_IPHONE)).toBe("Safari/iOS");
  });
  it("비었으면 알 수 없음", () => {
    expect(describeUserAgent(null)).toBe("알 수 없음");
    expect(describeUserAgent("  ")).toBe("알 수 없음");
  });
});

describe("formatLastActive / isRecentlyActive", () => {
  const now = new Date(2026, 10, 9, 14, 0);
  it("오늘이면 시각만, 아니면 날짜도 보인다", () => {
    expect(formatLastActive(new Date(2026, 10, 9, 13, 59).toISOString(), now)).toBe("13:59");
    expect(formatLastActive(new Date(2026, 10, 8, 9, 5).toISOString(), now)).toBe("11-08 09:05");
  });
  it("70분 안이면 접속 중으로 본다", () => {
    expect(isRecentlyActive(new Date(2026, 10, 9, 13, 0).toISOString(), now)).toBe(true);
    expect(isRecentlyActive(new Date(2026, 10, 9, 12, 0).toISOString(), now)).toBe(false);
  });
});

describe("formatSessionLine / sortSessionsByActivity", () => {
  const session = (id: string, lastActiveAt: string, ip: string | null = "203.0.113.5"): AdminSession => ({
    id,
    ip,
    userAgent: CHROME_WIN,
    createdAt: lastActiveAt,
    lastActiveAt,
  });
  it("IP · 브라우저/OS · 마지막 활동 한 줄", () => {
    const now = new Date(2026, 10, 9, 14, 0);
    const line = formatSessionLine(session("a", new Date(2026, 10, 9, 13, 59).toISOString()), now);
    expect(line).toBe("203.0.113.5 · Chrome/Windows · 마지막 활동 13:59");
    expect(formatSessionLine(session("b", new Date(2026, 10, 9, 13, 59).toISOString(), null), now)).toContain("IP 없음");
  });
  it("최근 활동 순으로 정렬한다", () => {
    const sorted = sortSessionsByActivity([session("old", "2026-11-08T01:00:00Z"), session("new", "2026-11-09T01:00:00Z")]);
    expect(sorted.map((s) => s.id)).toEqual(["new", "old"]);
  });
});
