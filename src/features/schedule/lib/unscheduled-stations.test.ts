import { describe, expect, it } from "vitest";
import {
  findUnscheduledStations,
  hasNoInstallDate,
  nextFreeRows,
  type UnscheduledSource,
} from "@/features/schedule/lib/unscheduled-stations";

const marker = (id: string, name: string, extra: Partial<UnscheduledSource> = {}): UnscheduledSource => ({
  id,
  name,
  installDate: "",
  ...extra,
});

describe("hasNoInstallDate", () => {
  it("마커와 장비 기록 모두 시설일이 비어야 true", () => {
    expect(hasNoInstallDate(marker("1", "A"))).toBe(true);
    expect(hasNoInstallDate(marker("1", "A", { installDate: "2026-01-02" }))).toBe(false);
    expect(
      hasNoInstallDate(
        marker("1", "A", { facilityRecords: [{ year: "2026", installDate: "", openDate: "" }] }),
      ),
    ).toBe(true);
    expect(
      hasNoInstallDate(
        marker("1", "A", { facilityRecords: [{ year: "2026", installDate: "2026-03-01", openDate: "" }] }),
      ),
    ).toBe(false);
  });
});

describe("findUnscheduledStations", () => {
  const markers = [
    marker("1", "가 국소"),
    marker("2", "나-국소", { finalStationName: "나국소(최종)" }),
    marker("3", "다국소", { installDate: "2026-02-01" }),
    marker("4", "라국소", { parentMarkerId: "1" }),
    marker("5", "마국소", { siteAlias: "마별칭, 마2" }),
    marker("6", ""),
  ];

  it("시설일이 없고 오늘 이후 일정에 없는 대표·단독 국소만 이름순으로 돌려준다", () => {
    const result = findUnscheduledStations(markers, ["마2"]);
    expect(result.map((station) => station.label)).toEqual(["가 국소", "나국소(최종)"]);
  });

  it("일정 글이 마커 이름·최종 국소명과 공백·하이픈·대소문자만 달라도 일정에 있는 것으로 본다", () => {
    expect(findUnscheduledStations(markers, ["가국소"]).map((s) => s.label)).toEqual(["나국소(최종)", "마국소"]);
    expect(findUnscheduledStations(markers, ["나국소"]).map((s) => s.label)).toEqual(["가 국소", "마국소"]);
  });

  it("사업구분·장비최종을 마커에서 가져온다", () => {
    const [station] = findUnscheduledStations(
      [marker("1", "가", { businessType: "신설", eqType: "RRU" })],
      [],
    );
    expect(station.businessType).toBe("신설");
    expect(station.eqType).toBe("RRU");
  });

  it("같은 국소명은 하나만 남긴다", () => {
    const result = findUnscheduledStations([marker("1", "같은국소"), marker("2", "같은국소")], []);
    expect(result).toHaveLength(1);
  });
});

describe("nextFreeRows", () => {
  it("그 칸에서 쓰는 마지막 행 다음부터 개수만큼 돌려주고, 상한을 넘으면 거기서 멈춘다", () => {
    expect(nextFreeRows([0, 1, 4], 3, 30)).toEqual([5, 6, 7]);
    expect(nextFreeRows([], 2, 30)).toEqual([0, 1]);
    expect(nextFreeRows([27], 5, 30)).toEqual([28, 29]);
  });
});
