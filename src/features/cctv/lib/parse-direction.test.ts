import { describe, expect, it } from "vitest";
import { hasDirectionHint, parseCctvDirection } from "./parse-direction";

describe("parseCctvDirection — 상행/하행", () => {
  it.each([
    ["광주대구선 담양1터널 상행", "상행"],
    ["호남선 백양사 하행", "하행"],
  ])("%s → %s", (name, expected) => {
    expect(parseCctvDirection(name).direction).toBe(expected);
  });

  it("상행/하행이 ○○방향보다 우선한다", () => {
    const r = parseCctvDirection("순천방향 상행");
    expect(r.direction).toBe("상행");
    expect(r.target).toBeNull();
  });
});

describe("parseCctvDirection — ○○방향", () => {
  it("대상지명을 뽑는다", () => {
    const r = parseCctvDirection("[국도1호선] 나주 순천방향");
    expect(r.direction).toBe("방향지정");
    expect(r.target).toBe("순천");
  });

  it("'양방향'은 방향 지정이 아니다", () => {
    const r = parseCctvDirection("무안IC 양방향");
    expect(r.direction).toBe("미상");
    expect(r.target).toBeNull();
  });
});

describe("parseCctvDirection — 화살표", () => {
  it.each(["광산IC ↑", "여수 →", "목포 ←", "강진 ↓"])("%s → 방향지정", (name) => {
    expect(parseCctvDirection(name).direction).toBe("방향지정");
  });

  it("화살표는 대상지명이 없다", () => {
    expect(parseCctvDirection("광산IC ↑").target).toBeNull();
  });
});

describe("parseCctvDirection — 방향 정보 없음", () => {
  it.each(["담양1터널", "", "   "])("%s → 미상", (name) => {
    expect(parseCctvDirection(name).direction).toBe("미상");
  });

  it("null·undefined도 미상", () => {
    expect(parseCctvDirection(null).direction).toBe("미상");
    expect(parseCctvDirection(undefined).direction).toBe("미상");
  });
});

describe("hasDirectionHint", () => {
  it("방향 신호가 하나라도 있으면 true", () => {
    expect(hasDirectionHint("담양 상행")).toBe(true);
    expect(hasDirectionHint("순천방향")).toBe(true);
    expect(hasDirectionHint("광산IC ↑")).toBe(true);
  });

  it("없으면 false — 수동 보정 대상 집계에 쓰인다", () => {
    expect(hasDirectionHint("담양1터널")).toBe(false);
    expect(hasDirectionHint("")).toBe(false);
  });

  it("'양방향'은 방향 지정은 아니지만 표기 자체는 있다", () => {
    // 집계상 '방향' 문자열이 있으므로 '정보 없음'으로는 세지 않는다
    expect(hasDirectionHint("무안IC 양방향")).toBe(true);
  });
});
