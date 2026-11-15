import { describe, expect, it } from "vitest";
import { createLatestRequest } from "./latest-request";

describe("createLatestRequest", () => {
  it("begin() 한 번이면 티켓의 isCurrent()가 true다", () => {
    const latest = createLatestRequest();
    const ticket = latest.begin();
    expect(ticket.isCurrent()).toBe(true);
  });

  it("begin()을 두 번 부르면 첫 티켓은 false, 둘째는 true다", () => {
    const latest = createLatestRequest();
    const first = latest.begin();
    const second = latest.begin();
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("invalidate() 뒤 기존 티켓은 false이고 새 begin() 티켓은 true다", () => {
    const latest = createLatestRequest();
    const before = latest.begin();
    latest.invalidate();
    expect(before.isCurrent()).toBe(false);

    const after = latest.begin();
    expect(after.isCurrent()).toBe(true);
    expect(before.isCurrent()).toBe(false);
  });

  it("서로 다른 인스턴스는 서로 영향을 주지 않는다", () => {
    const a = createLatestRequest();
    const b = createLatestRequest();
    const ticketA = a.begin();
    const ticketB = b.begin();

    a.invalidate();
    expect(ticketA.isCurrent()).toBe(false);
    expect(ticketB.isCurrent()).toBe(true);

    b.begin();
    expect(ticketB.isCurrent()).toBe(false);
  });
});
