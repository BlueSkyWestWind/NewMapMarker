import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ErpParsedRow } from "@/features/map-marker/lib/excel/data-manager/erp-parse";
import type { ExistingMarkerRef } from "./erp-classify";

const geocodeAddressQueueMock = vi.hoisted(() => vi.fn());

// 카카오 SDK(window.kakao.maps.services)를 감싼 외부 경계만 가짜로 대체한다.
vi.mock("@/features/map-marker/lib/geocode", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/map-marker/lib/geocode")>();
  return {
    ...actual,
    geocodeAddressQueue: geocodeAddressQueueMock,
  };
});

import { stageErpRows } from "./erp-staging";

const erpRow = (
  facilityCode: string,
  facilityYear: string,
  address = "광주 북구 운암동 1",
): ErpParsedRow => ({
  facilityCode,
  name: `국소 ${facilityCode}`,
  address,
  projectCode: "P1",
  facilityYear,
  businessType: "신설",
  eqClass: "",
  eqType: "",
  installDate: "",
  openDate: "",
  finalStationName: "",
  erp: {},
  raw: {},
});

const existingMarker = (
  id: string,
  code: string,
  years: string[],
): ExistingMarkerRef => ({
  id,
  name: `기존 ${code}`,
  facility_code: code,
  lat: 35.1,
  lng: 126.9,
  facility_years: years,
  project_codes: ["P1"],
  info_rows: [],
});

beforeEach(() => {
  geocodeAddressQueueMock.mockReset();
  geocodeAddressQueueMock.mockResolvedValue({
    results: [],
    successCount: 0,
    failCount: 0,
    failedItems: [],
  });
});

describe("stageErpRows", () => {
  it("기존 마커에 없는 새 코드 행은 reviewRows에 들어가고 지오코더 좌표를 받는다", async () => {
    // 출처: erp-classify.ts 주석 ("새 마커(erp_코드_연도)") 및 types/marker.ts StagedErpUpload
    geocodeAddressQueueMock.mockImplementationOnce(
      async (targets: Array<{ id: string; name: string; address: string }>) => ({
        results: targets.map((t) => ({ ...t, lat: 35.5, lng: 127.5 })),
        successCount: targets.length,
        failCount: 0,
        failedItems: [],
      }),
    );

    const result = await stageErpRows({
      rows: [erpRow("FC1", "2026")],
      existing: [],
      previous: new Map(),
      needsRegroup: false,
    });

    expect(result.reviewRows).toHaveLength(1);
    expect(result.reviewRows[0]).toMatchObject({
      kind: "new",
      lat: 35.5,
      lng: 127.5,
      marker: { facility_code: "FC1" },
    });
    expect(result.existingRows).toHaveLength(0);
    expect(result.skippedRows).toHaveLength(0);
  });

  it("같은 코드·연도의 기존 마커가 있는 행은 existingRows로 가고 preview가 붙는다", async () => {
    // 출처: erp-staging.ts 57-59행 ("staged.kind === 'existing' -> previewExistingRow") 및 erp-classify.test.ts
    const result = await stageErpRows({
      rows: [erpRow("FC1", "2026")],
      existing: [existingMarker("m1", "FC1", ["2026"])],
      previous: new Map(),
      needsRegroup: false,
    });

    expect(result.existingRows).toHaveLength(1);
    expect(result.existingRows[0].kind).toBe("existing");
    expect(result.existingRows[0].preview).toBeDefined();
    expect(result.reviewRows).toHaveLength(0);
  });

  it("코드가 없거나 주소가 없는 행은 skippedRows에 사유와 함께 담긴다", async () => {
    // 출처: types/marker.ts StagedErpSkippedRow.reason ("코드 없음" | "주소 없음")
    const result = await stageErpRows({
      rows: [erpRow("", "2026"), erpRow("FC2", "2026", "")],
      existing: [],
      previous: new Map(),
      needsRegroup: false,
    });

    expect(result.skippedRows).toEqual([
      { name: "국소 ", address: "광주 북구 운암동 1", reason: "코드 없음" },
      { name: "국소 FC2", address: "", reason: "주소 없음" },
    ]);
    expect(result.reviewRows).toHaveLength(0);
  });

  it("previous에 위치가 있는 새 행은 지오코딩에서 빠지고 기존 위치를 유지한다", async () => {
    // 출처: erp-staging.ts 32행 ("!previous.has(item.id)") 및 64-67행 ("withPreviousCoords")
    const onStatus = vi.fn();
    const result = await stageErpRows({
      rows: [erpRow("FC1", "2026")],
      existing: [],
      previous: new Map([["erp_FC1", { lat: 36.1, lng: 128.1 }]]),
      needsRegroup: false,
      onStatus,
    });

    expect(geocodeAddressQueueMock).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
    expect(result.reviewRows[0]).toMatchObject({
      id: "erp_FC1",
      lat: 36.1,
      lng: 128.1,
    });
  });

  it("지오코딩 대상이 있으면 onStatus를 호출하고, 없으면 지오코더와 onStatus를 호출하지 않는다", async () => {
    // 출처: erp-staging.ts 42-46행 ("if (geocodeTargets.length > 0) { onStatus?.(...); geocodeAddressQueue(...) }")
    const onStatusEmpty = vi.fn();
    await stageErpRows({
      rows: [erpRow("FC1", "2026")],
      existing: [existingMarker("m1", "FC1", ["2026"])],
      previous: new Map(),
      needsRegroup: false,
      onStatus: onStatusEmpty,
    });
    expect(geocodeAddressQueueMock).not.toHaveBeenCalled();
    expect(onStatusEmpty).not.toHaveBeenCalled();

    const onStatusActive = vi.fn();
    await stageErpRows({
      rows: [erpRow("FC2", "2026")],
      existing: [],
      previous: new Map(),
      needsRegroup: false,
      onStatus: onStatusActive,
    });
    expect(geocodeAddressQueueMock).toHaveBeenCalledTimes(1);
    expect(onStatusActive).toHaveBeenCalled();
  });

  it("지오코딩 실패 항목이 있으면 geocodeFailedAddresses에 주소별 건수로 정리된다", async () => {
    // 출처: excel-upload-helpers.ts formatFailedAddresses 주석 ("같은 주소가 여러 행이면 '주소 (N건)' 형태")
    geocodeAddressQueueMock.mockImplementationOnce(
      async (targets: Array<{ id: string; name: string; address: string }>) => ({
        results: [],
        successCount: 0,
        failCount: targets.length,
        failedItems: targets,
      }),
    );

    const result = await stageErpRows({
      rows: [
        erpRow("FC1", "2026", "광주 북구 운암동 1"),
        erpRow("FC2", "2026", "광주 북구 운암동 1"),
        erpRow("FC3", "2026", "광주 북구 두암동 2"),
      ],
      existing: [],
      previous: new Map(),
      needsRegroup: false,
    });

    expect(result.geocodeFailedAddresses).toEqual([
      "광주 북구 운암동 1 (2건)",
      "광주 북구 두암동 2",
    ]);
  });
});
