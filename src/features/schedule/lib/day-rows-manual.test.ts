import { describe, expect, it } from "vitest";
import { buildDayRows, manualStationsOf } from "@/features/schedule/lib/day-rows";
import type { DayDetail } from "@/features/schedule/lib/day-types";

const detail = (stationKey: string, site: string, extra: Partial<DayDetail> = {}): DayDetail => ({
  workDate: "2026-11-09",
  stationKey,
  site,
  workCategory: null,
  levelLabel: null,
  workTime: null,
  workType: null,
  equipment: null,
  workContent: null,
  workDetail: null,
  worker: null,
  witness: null,
  signaler: null,
  overrides: {},
  ...extra,
});

describe("직접 추가한 행", () => {
  it("isManual인 상세만, 일정에 이미 있는 국소는 빼고 돌려준다", () => {
    const details = [
      detail("a국소", "A 국소", { isManual: true }),
      detail("b국소", "B 국소", { isManual: true }),
      detail("c국소", "C 국소"),
    ];
    const result = manualStationsOf(details, [{ key: "b국소" }]);
    expect(result.map((station) => station.key)).toEqual(["a국소"]);
  });

  it("일정이 없어도 직접 추가한 행이 표에 나오고, 덮어쓴 통합시설코드가 보인다", () => {
    const rows = buildDayRows({
      workDate: "2026-11-09",
      columns: [],
      cells: [],
      details: new Map([
        ["a국소", detail("a국소", "A 국소", { isManual: true, overrides: { facilityCode: "X-1" } })],
      ]),
      refs: { erp: new Map(), archive: new Map(), marker: new Map() },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].isManual).toBe(true);
    expect(rows[0].values.site).toBe("A 국소");
    expect(rows[0].values.facilityCode).toBe("X-1");
    expect(rows[0].values.seq).toBe("1");
  });
});
