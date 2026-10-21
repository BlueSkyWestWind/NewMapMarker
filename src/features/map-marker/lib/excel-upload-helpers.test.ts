import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MARKER_COLOR,
  PENDING_MARKER_COLOR,
  TEMP_MARKER_COLOR,
} from "@/features/map-marker/constants/facility-teams";
import type { StagedErpUpload } from "@/features/map-marker/types/marker";
import {
  buildErpSummary,
  formatFailedAddresses,
  hasStoredCoordinates,
  isValidCoordinate,
  resetFileInput,
  resolveStoredMarkerColor,
  stagedMarkerRowToPending,
  toEquipmentMarker,
} from "./excel-upload-helpers";

describe("formatFailedAddresses", () => {
  it("같은 주소는 '주소 (N건)'으로 묶고, 주소가 없으면 이름, 둘 다 없으면 '(주소 없음)'", () => {
    expect(
      formatFailedAddresses([
        { address: " 광주 북구 1 " },
        { address: "광주 북구 1" },
        { name: "국소A" },
        {},
      ]),
    ).toEqual(["광주 북구 1 (2건)", "국소A", "(주소 없음)"]);
  });

  it("빈 목록은 빈 배열", () => {
    expect(formatFailedAddresses([])).toEqual([]);
  });
});

describe("좌표·색상 판정", () => {
  it("isValidCoordinate: 유한한 수만 true", () => {
    expect(isValidCoordinate(37.5)).toBe(true);
    expect(isValidCoordinate(Number.NaN)).toBe(false);
    expect(isValidCoordinate(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("hasStoredCoordinates: 숫자 문자열도 허용하고 (0,0)·비수치는 false", () => {
    expect(hasStoredCoordinates(37.5, 127)).toBe(true);
    expect(hasStoredCoordinates("37.5", "127")).toBe(true);
    expect(hasStoredCoordinates(0, 0)).toBe(false);
    expect(hasStoredCoordinates(null, null)).toBe(false);
    expect(hasStoredCoordinates(Number.NaN, 127)).toBe(false);
    expect(hasStoredCoordinates("abc", 127)).toBe(false);
  });

  it("resolveStoredMarkerColor: 없음·임시·대기 색은 기본 색, 그 외는 그대로", () => {
    expect(resolveStoredMarkerColor(undefined)).toBe(DEFAULT_MARKER_COLOR);
    expect(resolveStoredMarkerColor(PENDING_MARKER_COLOR)).toBe(DEFAULT_MARKER_COLOR);
    expect(resolveStoredMarkerColor(TEMP_MARKER_COLOR)).toBe(DEFAULT_MARKER_COLOR);
    expect(resolveStoredMarkerColor("#123456")).toBe("#123456");
  });
});

describe("resetFileInput", () => {
  it("입력이 있으면 value를 비우고, null이면 아무 일도 하지 않는다", () => {
    const input = { value: "C:\\fakepath\\a.xlsx" } as HTMLInputElement;
    resetFileInput(input);
    expect(input.value).toBe("");
    expect(() => resetFileInput(null)).not.toThrow();
  });
});

describe("마커 변환", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T03:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("toEquipmentMarker: 대기(pending) 마커는 대기 색, 빈 값은 빈 문자열/빈 배열", () => {
    const marker = toEquipmentMarker({ id: "m1", name: "국소A", lat: 37.5, lng: 127 });

    expect(marker).toMatchObject({
      id: "m1",
      name: "국소A",
      lat: 37.5,
      lng: 127,
      memo: "",
      tags: [],
      color: PENDING_MARKER_COLOR,
      facilityTeam: "",
      isPending: true,
      createdAt: "2026-10-21",
    });
  });

  it("toEquipmentMarker: isPending=false면 행의 색을 쓰고, 없으면 기본 색", () => {
    expect(toEquipmentMarker({ id: "a", color: "#abcdef" }, false).color).toBe("#abcdef");
    expect(toEquipmentMarker({ id: "a" }, false).color).toBe(DEFAULT_MARKER_COLOR);
    expect(toEquipmentMarker({ id: "a" }, false).isPending).toBe(false);
  });

  it("toEquipmentMarker: id가 없으면 pending_ 접두 임시 id, 좌표가 없으면 NaN", () => {
    const marker = toEquipmentMarker({ name: "x" });
    expect(marker.id.startsWith("pending_")).toBe(true);
    expect(Number.isNaN(marker.lat)).toBe(true);
  });

  it("toEquipmentMarker: 주소 한 칸이면 도로명/지번으로 나눠 담는다", () => {
    expect(toEquipmentMarker({ id: "a", address: "광주광역시 북구 첨단로 123" }).roadAddress).toBe(
      "광주광역시 북구 첨단로 123",
    );
    expect(toEquipmentMarker({ id: "a", address: "광주광역시 북구 두암동 123-4" }).jibunAddress).toBe(
      "광주광역시 북구 두암동 123-4",
    );
  });

  it("stagedMarkerRowToPending: 스테이징 행을 대기 장비 마커로", () => {
    const marker = stagedMarkerRowToPending({
      id: 7,
      name: "국소A",
      lat: "37.5",
      lng: "127",
      tags: ["a"],
      road_address: "R",
      jibun_address: "J",
      facility_code: "F-1",
    });

    expect(marker).toMatchObject({
      id: "7",
      name: "국소A",
      lat: 37.5,
      lng: 127,
      tags: ["a"],
      color: PENDING_MARKER_COLOR,
      roadAddress: "R",
      jibunAddress: "J",
      facilityCode: "F-1",
      isPending: true,
      createdAt: "2026-10-21",
    });
  });
});

describe("buildErpSummary", () => {
  const payload = (meta: Partial<StagedErpUpload["meta"]>): StagedErpUpload => ({
    markerRows: [{}, {}, {}],
    infoRows: [],
    erpRows: [],
    meta: {
      preservedCoordCount: 0,
      newCoordCount: 0,
      geocodeFailCount: 0,
      geocodeFailedAddresses: [],
      ...meta,
    },
  });

  it("기본 요약은 저장 건수만", () => {
    expect(buildErpSummary(payload({}), { groupCount: 0, subCount: 0 })).toBe(
      "위치등록 3건을 저장했습니다.",
    );
  });

  it("기존 좌표 유지·신규 좌표·취합·실패 문구를 순서대로 덧붙인다", () => {
    expect(
      buildErpSummary(
        payload({ preservedCoordCount: 2, newCoordCount: 1, geocodeFailCount: 1 }),
        { groupCount: 1, subCount: 2 },
      ),
    ).toBe(
      "위치등록 3건을 저장했습니다. (기존 위경도 유지 2건 · 신규 좌표 1건)" +
        " (동일 번지 취합: 그룹 1 · 서브 2건)" +
        " (주소 찾기 실패: 1건 — 좌표 없이 저장됨)",
    );
  });

  it("기존 좌표 유지만 있으면 신규 좌표 문구는 없다", () => {
    expect(buildErpSummary(payload({ preservedCoordCount: 2 }), { groupCount: 0, subCount: 0 })).toBe(
      "위치등록 3건을 저장했습니다. (기존 위경도 유지 2건)",
    );
  });
});
