"use client";

import { type ReactNode, useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_MARKER_COLOR,
  PENDING_MARKER_COLOR,
  TEMP_MARKER_COLOR,
} from "@/features/map-marker/constants/facility-teams";
import { MAP_MARKER_QUERY_KEY } from "@/features/map-marker/constants/map-config";
import {
  geocodeAddressQueue,
  splitAddressFields,
} from "@/features/map-marker/lib/geocode";
import { createLocationMarkerFromExcelRow } from "@/features/map-marker/lib/location-marker";
import {
  parseErpSheet,
  type ErpParsedRow,
} from "@/features/map-marker/lib/excel/data-manager/erp-parse";
import { applyMarkerRolesFromStoredGroupRole } from "@/features/map-marker/lib/address-group";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import type {
  BatteryMarker,
  EquipmentMarker,
  MarkerRecord,
  StagedErpUpload,
} from "@/features/map-marker/types/marker";

interface ParsedExcelRow {
  id?: string;
  name?: string;
  lat?: number;
  lng?: number;
  address?: string;
  memo?: string;
  tags?: string[];
  color?: string;
  facilityCode?: string;
  projectCode?: string;
  facilityYear?: string;
  businessType?: string;
  finalStationName?: string;
  eqClass?: string;
  eqType?: string;
  installDate?: string;
  openDate?: string;
  roadAddress?: string;
  jibunAddress?: string;
}

function resetFileInput(input: HTMLInputElement | null) {
  if (input) {
    input.value = "";
  }
}

/**
 * 지오코딩 실패 항목을 주소별로 묶어 사람이 읽을 목록으로 만든다.
 * (같은 주소가 여러 행이면 "주소 (N건)" 형태)
 */
function formatFailedAddresses(
  items: Array<{ address?: string; name?: string }>,
): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key =
      (item.address ?? "").trim() || (item.name ?? "").trim() || "(주소 없음)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([address, count]) =>
    count > 1 ? `${address} (${count}건)` : address,
  );
}

const FAILED_ADDRESS_DISPLAY_LIMIT = 10;

/**
 * 업로드 결과 토스트 본문. 실패 주소가 있으면 요약 아래에 목록으로 노출한다.
 */
function buildUploadResultDescription(
  summary: string,
  failedAddresses: string[],
): ReactNode {
  if (failedAddresses.length === 0) return summary;

  const shown = failedAddresses.slice(0, FAILED_ADDRESS_DISPLAY_LIMIT);
  const rest = failedAddresses.length - shown.length;

  return (
    <div className="space-y-1">
      <p>{summary}</p>
      <div className="text-[11px] leading-snug opacity-90">
        <p className="font-medium">주소 찾기 실패 {failedAddresses.length}종:</p>
        <ul className="list-disc space-y-0.5 pl-4">
          {shown.map((address) => (
            <li key={address}>{address}</li>
          ))}
        </ul>
        {rest > 0 ? <p className="pl-4">…외 {rest}종</p> : null}
      </div>
    </div>
  );
}

function resolveStoredMarkerColor(color: string | undefined) {
  if (!color || color === PENDING_MARKER_COLOR || color === TEMP_MARKER_COLOR) {
    return DEFAULT_MARKER_COLOR;
  }
  return color;
}

function isValidCoordinate(value: number) {
  return Number.isFinite(value);
}

function hasStoredCoordinates(lat: unknown, lng: unknown): boolean {
  const latNumber = typeof lat === "number" ? lat : Number(lat);
  const lngNumber = typeof lng === "number" ? lng : Number(lng);
  return (
    Number.isFinite(latNumber) &&
    Number.isFinite(lngNumber) &&
    !(latNumber === 0 && lngNumber === 0)
  );
}

function toEquipmentMarker(
  marker: ParsedExcelRow,
  isPending = true,
): EquipmentMarker {
  const { roadAddress, jibunAddress } = splitAddressFields({
    roadAddress: marker.roadAddress,
    jibunAddress: marker.jibunAddress,
    address: marker.address,
  });
  return {
    id: String(
      marker.id ??
        `pending_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    ),
    name: String(marker.name ?? ""),
    lat: Number(marker.lat),
    lng: Number(marker.lng),
    memo: String(marker.memo ?? ""),
    tags: Array.isArray(marker.tags) ? marker.tags : [],
    color: isPending
      ? PENDING_MARKER_COLOR
      : String(marker.color ?? DEFAULT_MARKER_COLOR),
    facilityTeam: "",
    roadAddress,
    jibunAddress,
    facilityCode: String(marker.facilityCode ?? ""),
    projectCode: String(marker.projectCode ?? ""),
    facilityYear: String(marker.facilityYear ?? ""),
    businessType: String(marker.businessType ?? ""),
    finalStationName: String(marker.finalStationName ?? ""),
    eqClass: String(marker.eqClass ?? ""),
    eqType: String(marker.eqType ?? ""),
    installDate: String(marker.installDate ?? ""),
    openDate: String(marker.openDate ?? ""),
    createdAt: new Date().toISOString().split("T")[0],
    isPending,
  };
}

/** 스테이징된 위치등록 markerRow → 지도 표시용 임시(pending) 장비 마커 */
function stagedMarkerRowToPending(row: Record<string, unknown>): EquipmentMarker {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    lat: Number(row.lat),
    lng: Number(row.lng),
    memo: String(row.memo ?? ""),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    color: PENDING_MARKER_COLOR,
    facilityTeam: "",
    roadAddress: String(row.road_address ?? ""),
    jibunAddress: String(row.jibun_address ?? ""),
    facilityCode: String(row.facility_code ?? ""),
    projectCode: "",
    facilityYear: "",
    businessType: "",
    finalStationName: "",
    eqClass: "",
    eqType: "",
    installDate: "",
    openDate: "",
    createdAt: new Date().toISOString().split("T")[0],
    isPending: true,
  };
}

/** 위치등록 저장 결과 토스트 요약문 (즉시 저장·적용 공용) */
function buildErpSummary(
  payload: StagedErpUpload,
  regroup: { groupCount: number; subCount: number },
): string {
  const { markerRows, meta } = payload;
  let summary = `위치등록 ${markerRows.length}건을 저장했습니다.`;
  if (meta.preservedCoordCount > 0) {
    summary += ` (기존 위경도 유지 ${meta.preservedCoordCount}건`;
    if (meta.newCoordCount > 0) summary += ` · 신규 좌표 ${meta.newCoordCount}건`;
    summary += ")";
  }
  if (regroup.subCount > 0) {
    summary += ` (동일 번지 취합: 그룹 ${regroup.groupCount} · 서브 ${regroup.subCount}건)`;
  }
  if (meta.geocodeFailCount > 0) {
    summary += ` (주소 찾기 실패: ${meta.geocodeFailCount}건 — 좌표 없이 저장됨)`;
  }
  return summary;
}

export function useExcelUploadActions() {
  const { supabase, isAuthenticated } = useAuthSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mode = useMapMarkerStore((state) => state.mode);
  const pendingEquipment = useMapMarkerStore(
    (state) => state.pendingEquipmentMarkers,
  );
  const pendingBattery = useMapMarkerStore(
    (state) => state.pendingBatteryMarkers,
  );
  const pendingLocation = useMapMarkerStore(
    (state) => state.pendingLocationMarkers,
  );
  const pendingMarkers =
    mode === "equipment"
      ? pendingEquipment
      : mode === "battery"
        ? pendingBattery
        : pendingLocation;
  const addPendingMarkers = useMapMarkerStore(
    (state) => state.addPendingMarkers,
  );
  const clearPendingMarkers = useMapMarkerStore(
    (state) => state.clearPendingMarkers,
  );
  const removePendingMarkers = useMapMarkerStore(
    (state) => state.removePendingMarkers,
  );
  const setStagedErpUpload = useMapMarkerStore(
    (state) => state.setStagedErpUpload,
  );
  const stagedErpUpload = useMapMarkerStore((state) => state.stagedErpUpload);
  const setFilters = useMapMarkerStore((state) => state.setFilters);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  // uploadErpExcel 은 아래에서 정의되므로, 위치 업로드에서 참조할 수 있도록 ref 로 우회한다.
  const uploadErpExcelRef = useRef<
    ((file: File, input?: HTMLInputElement | null) => Promise<void>) | null
  >(null);

  const invalidateMarkers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY });
  }, [queryClient]);

  const uploadEquipmentExcel = useCallback(
    async (file: File, input?: HTMLInputElement | null) => {
      // 공정관리(ERP) 시트면 DB(공정)로 바로 저장 — 한 번 업로드로 저장 + 지도 표시.
      if (isAuthenticated && supabase) {
        let isErp = false;
        try {
          isErp = (await parseErpSheet(file)).length > 0;
        } catch {
          isErp = false;
        }
        if (isErp) {
          await uploadErpExcelRef.current?.(file, input);
          return;
        }
      }

      const MapMarkerExcelManager = (
        await import("@/features/map-marker/lib/excel/data-manager")
      ).default;
      if (!isAuthenticated) {
        toast({
          variant: "destructive",
          description: "엑셀 위치 업로드는 로그인 후 사용할 수 있습니다.",
        });
        resetFileInput(input ?? null);
        return;
      }

      setIsUploading(true);
      setStatusText("Excel 파일 분석 중...");

      try {
        const parsedData = (await MapMarkerExcelManager.parseExcelOrCSV(
          file,
        )) as ParsedExcelRow[];
        const withCoords = parsedData.filter(
          (item) => item.lat !== undefined && item.lng !== undefined,
        );
        const needGeocoding = parsedData.filter(
          (item) => item.lat === undefined || item.lng === undefined,
        );

        let geocodeResults: typeof parsedData = [];
        let failCount = 0;
        let failedItems: ParsedExcelRow[] = [];

        if (needGeocoding.length > 0) {
          setStatusText(
            `주소 좌표 변환 시작... (총 ${needGeocoding.length}건)`,
          );
          const geocoded = await geocodeAddressQueue(
            needGeocoding,
            (current, total) => {
              setStatusText(`주소 좌표 변환 중... (${current}/${total})`);
            },
          );
          geocodeResults = geocoded.results.map((item) => ({
            ...item,
            // 사용자가 입력한 주소가 도로명/지번 중 어느 쪽인지 판별해 배정
            ...splitAddressFields({ address: item.address }),
          }));
          failCount = geocoded.failCount;
          failedItems = geocoded.failedItems;
        }

        const finalMarkers = [...withCoords, ...geocodeResults].map((marker) =>
          toEquipmentMarker(marker, true),
        );

        if (!finalMarkers.length) {
          throw new Error("가져올 수 있는 유효한 위치 데이터가 없습니다.");
        }

        const existingIds = new Set(pendingMarkers.map((marker) => marker.id));
        const newMarkers = finalMarkers.filter(
          (marker) => !existingIds.has(marker.id),
        );
        addPendingMarkers("equipment", newMarkers);

        let summary = `엑셀 위치 마킹 완료! 총 ${newMarkers.length}개 장소가 대기 중입니다.`;
        if (failCount > 0) {
          summary += ` (주소 찾기 실패: ${failCount}건)`;
        }
        toast({
          description: buildUploadResultDescription(
            summary,
            formatFailedAddresses(failedItems),
          ),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";
        toast({ variant: "destructive", description: message });
      } finally {
        setIsUploading(false);
        setStatusText(null);
        resetFileInput(input ?? null);
      }
    },
    [addPendingMarkers, isAuthenticated, pendingMarkers, toast, supabase],
  );

  /**
   * 장비 엑셀과 동일한 파서로 읽고, 위치 모드 임시 마커로만 올린다. (DB/로그인 불필요)
   */
  const uploadLocationExcel = useCallback(
    async (file: File, input?: HTMLInputElement | null) => {
      // 공정관리(ERP) 시트 + 로그인 상태면, 임시 표시 대신 DB(공정)에 바로 저장한다.
      // → 한 번 업로드로 "지도 표시 + DB 저장"을 함께 처리.
      if (isAuthenticated && supabase) {
        let isErp = false;
        try {
          isErp = (await parseErpSheet(file)).length > 0;
        } catch {
          isErp = false;
        }
        if (isErp) {
          await uploadErpExcelRef.current?.(file, input);
          return;
        }
      }

      const MapMarkerExcelManager = (
        await import("@/features/map-marker/lib/excel/data-manager")
      ).default;

      setIsUploading(true);
      setStatusText("Excel 파일 분석 중...");

      try {
        // 공정관리(ERP) 시트면 전용 파서로 이름+주소만 뽑고, 아니면 단순 파서로 폴백.
        // (위치 모드는 임시 표시용이라 이름·주소만 있으면 충분)
        let parsedData: ParsedExcelRow[];
        try {
          const erpRows = await parseErpSheet(file);
          parsedData = erpRows.length
            ? erpRows.map((r) => ({ name: r.name, address: r.address }))
            : ((await MapMarkerExcelManager.parseExcelOrCSV(
                file,
              )) as ParsedExcelRow[]);
        } catch {
          parsedData = (await MapMarkerExcelManager.parseExcelOrCSV(
            file,
          )) as ParsedExcelRow[];
        }
        const withCoords = parsedData.filter(
          (item) => item.lat !== undefined && item.lng !== undefined,
        );
        const needGeocoding = parsedData.filter(
          (item) => item.lat === undefined || item.lng === undefined,
        );

        let geocodeResults: ParsedExcelRow[] = [];
        let failCount = 0;
        let failedItems: ParsedExcelRow[] = [];

        if (needGeocoding.length > 0) {
          setStatusText(
            `주소 좌표 변환 시작... (총 ${needGeocoding.length}건)`,
          );
          const geocoded = await geocodeAddressQueue(
            needGeocoding,
            (current, total) => {
              setStatusText(`주소 좌표 변환 중... (${current}/${total})`);
            },
          );
          geocodeResults = geocoded.results.map((item) => ({
            ...item,
            // 사용자가 입력한 주소가 도로명/지번 중 어느 쪽인지 판별해 배정
            ...splitAddressFields({ address: item.address }),
          }));
          failCount = geocoded.failCount;
          failedItems = geocoded.failedItems;
        }

        const existingIds = new Set(pendingLocation.map((marker) => marker.id));
        const startIndex = pendingLocation.length + 1;
        const newMarkers = [...withCoords, ...geocodeResults]
          .map((row, index) =>
            createLocationMarkerFromExcelRow(row, startIndex + index),
          )
          .filter(
            (marker): marker is NonNullable<typeof marker> => marker !== null,
          )
          .filter((marker) => !existingIds.has(marker.id));

        if (!newMarkers.length) {
          throw new Error("가져올 수 있는 유효한 위치 데이터가 없습니다.");
        }

        addPendingMarkers("location", newMarkers);

        let summary = `임시 위치 ${newMarkers.length}건이 지도에 표시되었습니다.`;
        if (failCount > 0) {
          summary += ` (주소 찾기 실패: ${failCount}건)`;
        }
        toast({
          description: buildUploadResultDescription(
            summary,
            formatFailedAddresses(failedItems),
          ),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";
        toast({ variant: "destructive", description: message });
      } finally {
        setIsUploading(false);
        setStatusText(null);
        resetFileInput(input ?? null);
      }
    },
    [addPendingMarkers, pendingLocation, toast, isAuthenticated, supabase],
  );

  /**
   * 공정관리 양식(또는 information 양식)의 추가 입력 항목만 갱신한다.
   * 통합시설코드로 기존 markers 에 연결된 information 만 업데이트(신규 마커 생성 없음).
   */
  const uploadInfoExcel = useCallback(
    async (file: File, input?: HTMLInputElement | null) => {
      const MapMarkerExcelManager = (
        await import("@/features/map-marker/lib/excel/data-manager")
      ).default;
      if (!isAuthenticated || !supabase) {
        toast({
          variant: "destructive",
          description: "추가항목 업데이트는 로그인 후 사용할 수 있습니다.",
        });
        resetFileInput(input ?? null);
        return;
      }

      setIsUploading(true);
      setStatusText("추가항목 파일 분석 중...");

      try {
        let parsedData: Record<string, unknown>[] = [];

        // 공정관리(ERP) 양식이면 추가항목 필드로 변환
        try {
          const erpRows = await parseErpSheet(file);
          if (erpRows.length > 0) {
            parsedData = erpRows.map((row) => ({
              facility_code: row.facilityCode,
              project_code: row.projectCode,
              facility_year: row.facilityYear,
              business_type: row.businessType,
              place_name: row.name,
              final_station_name: row.finalStationName,
              eq_class: row.eqClass,
              eq_type: row.eqType,
              install_date: row.installDate,
              open_date: row.openDate,
            }));
          }
        } catch {
          // ERP 형식이 아니면 information 양식으로 파싱
        }

        if (!parsedData.length) {
          parsedData = (await MapMarkerExcelManager.parseInfoExcel(
            file,
          )) as Record<string, unknown>[];
        }

        if (!parsedData.length) {
          toast({ description: "업데이트할 추가항목 데이터가 없습니다." });
          return;
        }

        const { data: markersList, error } = await supabase
          .from("markers")
          .select("id, name, facility_code");
        if (error) throw error;

        const knownCodes = new Set(
          (markersList ?? [])
            .map((row) => String(row.facility_code ?? "").trim())
            .filter(Boolean),
        );
        const matched = parsedData.filter((row) =>
          knownCodes.has(String(row.facility_code ?? "").trim()),
        );
        const skipped = parsedData.length - matched.length;

        if (!matched.length) {
          throw new Error(
            "기존 마커와 일치하는 통합시설코드가 없습니다. 공정관리 시트 업로드 후 다시 시도하세요.",
          );
        }

        setStatusText(`추가항목 업데이트 중... (${matched.length}건)`);
        const result = await MapMarkerExcelManager.upsertInformationToSupabase(
          supabase,
          matched,
          markersList ?? [],
        );

        await invalidateMarkers();

        let message = `공정관리 추가항목 업데이트 완료 (갱신 ${result.count}건)`;
        if (skipped > 0) {
          message += ` · 미매칭 스킵 ${skipped}건`;
        }
        if (result.unlinkedCount > 0) {
          message += ` · marker_id 미연결 ${result.unlinkedCount}건`;
        }
        if (result.warning) {
          message += ` · ${result.warning}`;
        }
        toast({ description: message });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";
        toast({ variant: "destructive", description: message });
      } finally {
        setIsUploading(false);
        setStatusText(null);
        resetFileInput(input ?? null);
      }
    },
    [invalidateMarkers, isAuthenticated, supabase, toast],
  );

  const uploadBatteryExcel = useCallback(
    async (file: File, input?: HTMLInputElement | null) => {
      const MapMarkerExcelManager = (
        await import("@/features/map-marker/lib/excel/data-manager")
      ).default;
      if (!isAuthenticated) {
        toast({
          variant: "destructive",
          description: "축전지 엑셀 업로드는 로그인 후 사용할 수 있습니다.",
        });
        resetFileInput(input ?? null);
        return;
      }

      setIsUploading(true);
      setStatusText("축전지 Excel 파일 분석 중...");

      try {
        const parsed = (await MapMarkerExcelManager.parseBatteryExcel(
          file,
        )) as ParsedExcelRow[];
        if (!parsed.length) {
          throw new Error("가져올 수 있는 유효한 축전지 데이터가 없습니다.");
        }

        const needGeocoding = parsed.filter(
          (item) => item.lat === undefined || item.lng === undefined,
        );
        let results = parsed.filter(
          (item) => item.lat !== undefined && item.lng !== undefined,
        );
        let failCount = 0;
        let failedItems: ParsedExcelRow[] = [];

        if (needGeocoding.length > 0) {
          setStatusText(`주소 좌표 변환 중... (총 ${needGeocoding.length}건)`);
          const geocoded = await geocodeAddressQueue(
            needGeocoding,
            (current, total) => {
              setStatusText(`주소 좌표 변환 중... (${current}/${total})`);
            },
          );
          results = [...results, ...geocoded.results];
          failCount = geocoded.failCount;
          failedItems = geocoded.failedItems;
        }

        const pendingBatteryMarkers = results.map((marker) => ({
          ...marker,
          id: String(
            marker.id ??
              `bat_pending_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          ),
          isPending: true,
          color: PENDING_MARKER_COLOR,
        })) as MarkerRecord[];

        addPendingMarkers("battery", pendingBatteryMarkers);
        let batterySummary = `축전지 ${pendingBatteryMarkers.length}건이 대기 목록에 추가되었습니다. 전체 전송으로 DB에 저장하세요.`;
        if (failCount > 0) {
          batterySummary += ` (주소 찾기 실패: ${failCount}건)`;
        }
        toast({
          description: buildUploadResultDescription(
            batterySummary,
            formatFailedAddresses(failedItems),
          ),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";
        toast({ variant: "destructive", description: message });
      } finally {
        setIsUploading(false);
        setStatusText(null);
        resetFileInput(input ?? null);
      }
    },
    [addPendingMarkers, isAuthenticated, toast],
  );

  /**
   * 공정관리(ERP) 시트를 파싱해 markers·information·erp_details 에 직접 저장한다.
   * 위·경도는 최초 등록(또는 기존 좌표가 없을 때)에만 지오코딩한다.
   * 이미 좌표가 있는 마커는 위치등록/추가항목에서 덮어쓰지 않는다(백업·복원에서만 수정).
   */
  // 위치등록(공정관리) 시트를 파싱·지오코딩해 markers/information/erp_details 행을 만든다(DB 저장 없음).
  const buildErpPayload = useCallback(
    async (file: File): Promise<StagedErpUpload> => {
      if (!supabase) throw new Error("Supabase가 연결되어 있지 않습니다.");

      const rows = await parseErpSheet(file);
      if (!rows.length) {
        throw new Error("가져올 수 있는 데이터가 없습니다.");
      }

      const { data: existingMarkers, error: existingError } = await supabase
        .from("markers")
        .select("id, facility_code, lat, lng, created_at");
      if (existingError) throw existingError;

      const existingByFacilityCode = new Map<
        string,
        { id: string; lat: unknown; lng: unknown; created_at: string | null }
      >();
      const existingById = new Map<
        string,
        { id: string; lat: unknown; lng: unknown; created_at: string | null }
      >();
      for (const marker of existingMarkers ?? []) {
        const entry = {
          id: String(marker.id),
          lat: marker.lat,
          lng: marker.lng,
          created_at: marker.created_at ?? null,
        };
        existingById.set(entry.id, entry);
        const code = String(marker.facility_code ?? "").trim();
        if (code && !existingByFacilityCode.has(code)) {
          existingByFacilityCode.set(code, entry);
        }
      }

      const rowsNeedingGeocode: ErpParsedRow[] = [];
      const rowsWithPreservedCoords: Array<
        ErpParsedRow & { lat: number | null; lng: number | null; existingId?: string }
      > = [];

      for (const row of rows) {
        const code = String(row.facilityCode ?? "").trim();
        const preferredId = code ? `erp_${code}` : "";
        const existing =
          (code ? existingByFacilityCode.get(code) : undefined) ??
          (preferredId ? existingById.get(preferredId) : undefined);

        if (existing && hasStoredCoordinates(existing.lat, existing.lng)) {
          rowsWithPreservedCoords.push({
            ...row,
            lat: Number(existing.lat),
            lng: Number(existing.lng),
            existingId: existing.id,
          });
          continue;
        }

        rowsNeedingGeocode.push(row);
      }

      let geocodedResults: Array<
        ErpParsedRow & { lat: number | null; lng: number | null }
      > = [];
      let geocodeFailCount = 0;
      let geocodeFailedItems: ErpParsedRow[] = [];

      if (rowsNeedingGeocode.length > 0) {
        setStatusText(
          `주소 좌표 변환 시작... (신규/무좌표 ${rowsNeedingGeocode.length}건)`,
        );
        const geocoded = await geocodeAddressQueue(
          rowsNeedingGeocode,
          (current, total) => {
            setStatusText(`주소 좌표 변환 중... (${current}/${total})`);
          },
        );
        geocodedResults = [
          ...geocoded.results.map((r) => ({ ...r, lat: r.lat, lng: r.lng })),
          ...geocoded.failedItems.map((r) => ({
            ...r,
            lat: null as number | null,
            lng: null as number | null,
          })),
        ];
        geocodeFailCount = geocoded.failCount;
        geocodeFailedItems = geocoded.failedItems;
      }

      const allRows: Array<
        ErpParsedRow & {
          lat: number | null;
          lng: number | null;
          existingId?: string;
        }
      > = [...rowsWithPreservedCoords, ...geocodedResults];

      const usedIds = new Set<string>();
      const makeId = (facilityCode: string, existingId?: string) => {
        if (existingId && !usedIds.has(existingId)) {
          usedIds.add(existingId);
          return existingId;
        }
        const base = facilityCode
          ? `erp_${facilityCode}`
          : `erp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        let id = base;
        let n = 1;
        while (usedIds.has(id)) id = `${base}_${n++}`;
        usedIds.add(id);
        return id;
      };

      const nowIso = new Date().toISOString();
      const markerRows: Record<string, unknown>[] = [];
      const infoRows: Record<string, unknown>[] = [];
      const erpRows: Record<string, unknown>[] = [];
      let preservedCoordCount = 0;
      let newCoordCount = 0;

      for (const row of allRows) {
        const code = String(row.facilityCode ?? "").trim();
        const preferredId = code ? `erp_${code}` : "";
        const existing =
          (row.existingId ? existingById.get(row.existingId) : undefined) ??
          (code ? existingByFacilityCode.get(code) : undefined) ??
          (preferredId ? existingById.get(preferredId) : undefined);

        const id = makeId(row.facilityCode, existing?.id);
        const { roadAddress, jibunAddress } = splitAddressFields({
          address: row.address,
        });

        const keepExistingCoords =
          existing !== undefined &&
          hasStoredCoordinates(existing.lat, existing.lng);
        if (keepExistingCoords) {
          preservedCoordCount += 1;
        } else {
          newCoordCount += 1;
        }

        markerRows.push({
          id,
          name: row.name,
          lat: keepExistingCoords ? Number(existing.lat) : row.lat,
          lng: keepExistingCoords ? Number(existing.lng) : row.lng,
          memo: "",
          tags: [],
          color: DEFAULT_MARKER_COLOR,
          facility_team: "",
          facility_code: row.facilityCode || null,
          road_address: roadAddress,
          jibun_address: jibunAddress,
          // 기존 등록일은 유지, 신규만 현재 시각
          created_at: existing?.created_at || nowIso,
        });
        infoRows.push({
          marker_id: id,
          place_name: row.name,
          facility_code: row.facilityCode || null,
          project_code: row.projectCode,
          facility_year: row.facilityYear || "",
          business_type: row.businessType,
          final_station_name: row.finalStationName,
          eq_class: row.eqClass,
          eq_type: row.eqType,
          install_date: row.installDate,
          open_date: row.openDate,
        });
        erpRows.push({
          marker_id: id,
          ...row.erp,
          facility_code: row.facilityCode || row.erp.facility_code || null,
          raw: row.raw,
        });
      }

      return {
        markerRows,
        infoRows,
        erpRows,
        meta: {
          preservedCoordCount,
          newCoordCount,
          geocodeFailCount,
          geocodeFailedAddresses: formatFailedAddresses(geocodeFailedItems),
        },
      };
    },
    [supabase],
  );

  // 스테이징 payload를 DB에 커밋한다. coordOverrides 가 있으면(드래그로 조정된 좌표) 해당 마커 좌표를 덮어쓴다.
  const commitErpToDb = useCallback(
    async (
      payload: StagedErpUpload,
      coordOverrides?: Map<string, { lat: number; lng: number }>,
    ): Promise<{ groupCount: number; subCount: number }> => {
      if (!supabase) throw new Error("Supabase가 연결되어 있지 않습니다.");

      const { infoRows, erpRows } = payload;
      const markerRows = coordOverrides
        ? payload.markerRows.map((row) => {
            const override = coordOverrides.get(String(row.id));
            return override
              ? { ...row, lat: override.lat, lng: override.lng }
              : row;
          })
        : payload.markerRows;

      const chunk = <T,>(arr: T[], size: number): T[][] => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) {
          out.push(arr.slice(i, i + size));
        }
        return out;
      };
      const ids = markerRows.map((m) => m.id as string);

      // 재import 대비: 같은 marker_id 의 기존 자식행 제거 후 재삽입
      setStatusText("기존 데이터 정리 중...");
      for (const c of chunk(ids, 100)) {
        await supabase.from("erp_details").delete().in("marker_id", c);
        await supabase.from("information").delete().in("marker_id", c);
      }

      setStatusText(`저장 중... (총 ${markerRows.length}건)`);
      for (const c of chunk(markerRows, 200)) {
        const { error } = await supabase
          .from("markers")
          .upsert(c, { onConflict: "id" });
        if (error) throw error;
      }
      for (const c of chunk(infoRows, 200)) {
        const { error } = await supabase.from("information").insert(c);
        if (error) throw error;
      }
      for (const c of chunk(erpRows, 100)) {
        const { error } = await supabase.from("erp_details").insert(c);
        if (error) throw error;
      }

      setStatusText("동일 번지 주소 대표·서브 취합 중...");
      // 저장된 group_role(수동 지정한 대표/SUB)을 존중해 재그룹. 저장 역할이 전혀 없으면 등록일 기준으로 폴백.
      const regroup = await applyMarkerRolesFromStoredGroupRole(supabase);

      await invalidateMarkers();
      return regroup;
    },
    [supabase, invalidateMarkers],
  );

  // 자동 라우팅용(장비/위치 업로드에서 ERP 감지 시): 미리보기 없이 즉시 저장.
  const uploadErpExcel = useCallback(
    async (file: File, input?: HTMLInputElement | null) => {
      if (!isAuthenticated || !supabase) {
        toast({
          variant: "destructive",
          description: "공정관리 시트 업로드는 로그인 후 사용할 수 있습니다.",
        });
        resetFileInput(input ?? null);
        return;
      }

      setIsUploading(true);
      setStatusText("공정관리 시트 분석 중...");
      try {
        const payload = await buildErpPayload(file);
        const regroup = await commitErpToDb(payload);
        toast({
          description: buildUploadResultDescription(
            buildErpSummary(payload, regroup),
            payload.meta.geocodeFailedAddresses,
          ),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";
        toast({ variant: "destructive", description: `업로드 실패: ${message}` });
      } finally {
        setIsUploading(false);
        setStatusText(null);
        resetFileInput(input ?? null);
      }
    },
    [isAuthenticated, supabase, toast, buildErpPayload, commitErpToDb],
  );
  uploadErpExcelRef.current = uploadErpExcel;

  // "위치등록 업로드" 버튼: 즉시 저장하지 않고 지도에 임시 마커로 표시(미리보기). [적용] 시 저장.
  const prepareErpUpload = useCallback(
    async (file: File, input?: HTMLInputElement | null) => {
      if (!isAuthenticated || !supabase) {
        toast({
          variant: "destructive",
          description: "위치등록 업로드는 로그인 후 사용할 수 있습니다.",
        });
        resetFileInput(input ?? null);
        return;
      }

      setIsUploading(true);
      setStatusText("공정관리 시트 분석 중...");
      try {
        const payload = await buildErpPayload(file);

        // 좌표 있는 행만 지도에 임시 마커로 표시(드래그로 위치 조정 가능)
        const pending = payload.markerRows
          .filter(
            (row) =>
              Number.isFinite(Number(row.lat)) &&
              Number.isFinite(Number(row.lng)),
          )
          .map(stagedMarkerRowToPending);

        // 새 업로드는 직전 미리보기를 대체한다.
        clearPendingMarkers("equipment");
        addPendingMarkers("equipment", pending);
        setStagedErpUpload(payload);

        const noCoord = payload.markerRows.length - pending.length;
        let summary = `위치등록 ${payload.markerRows.length}건을 불러왔습니다. 지도에서 위치를 확인한 뒤 [적용]을 눌러 저장하세요.`;
        if (noCoord > 0) {
          summary += ` (좌표 없음 ${noCoord}건 — 지도 미표시, 적용 시 좌표 없이 저장)`;
        }
        toast({
          description: buildUploadResultDescription(
            summary,
            payload.meta.geocodeFailedAddresses,
          ),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";
        toast({ variant: "destructive", description: `불러오기 실패: ${message}` });
      } finally {
        setIsUploading(false);
        setStatusText(null);
        resetFileInput(input ?? null);
      }
    },
    [
      isAuthenticated,
      supabase,
      toast,
      buildErpPayload,
      addPendingMarkers,
      clearPendingMarkers,
      setStagedErpUpload,
    ],
  );

  // 미리보기 [적용]: 스테이징 payload를 지도상의(드래그로 조정된) 좌표로 DB에 저장.
  const applyStagedErp = useCallback(async () => {
    const staged = useMapMarkerStore.getState().stagedErpUpload;
    if (!staged) return;
    if (!supabase) {
      toast({
        variant: "destructive",
        description: "Supabase가 연결되어 있지 않습니다.",
      });
      return;
    }

    setIsUploading(true);
    try {
      // 지도에서 드래그로 조정된 pending 마커 좌표를 수집해 덮어쓴다.
      const overrides = new Map<string, { lat: number; lng: number }>();
      for (const m of useMapMarkerStore.getState().pendingEquipmentMarkers) {
        if (Number.isFinite(m.lat) && Number.isFinite(m.lng)) {
          overrides.set(m.id, { lat: m.lat, lng: m.lng });
        }
      }

      const regroup = await commitErpToDb(staged, overrides);

      clearPendingMarkers("equipment");
      setStagedErpUpload(null);
      // 저장 직후 새 마커가 필터에 가려지지 않도록 필터 초기화
      setFilters({
        selectedYears: new Set(),
        selectedBusinesses: new Set(),
        selectedColors: new Set(),
        selectedTags: new Set(),
        selectedCapacities: new Set(),
        selectedQuantities: new Set(),
        selectedStations: new Set(),
      });
      toast({
        description: buildUploadResultDescription(
          buildErpSummary(staged, regroup),
          staged.meta.geocodeFailedAddresses,
        ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      toast({ variant: "destructive", description: `적용 실패: ${message}` });
    } finally {
      setIsUploading(false);
      setStatusText(null);
    }
  }, [supabase, toast, commitErpToDb, clearPendingMarkers, setStagedErpUpload, setFilters]);

  // 미리보기 취소: 임시 마커·스테이징 폐기(DB 미반영).
  const cancelStagedErp = useCallback(() => {
    const count =
      useMapMarkerStore.getState().stagedErpUpload?.markerRows.length ?? 0;
    clearPendingMarkers("equipment");
    setStagedErpUpload(null);
    if (count > 0) {
      toast({ description: "위치등록 미리보기를 취소했습니다." });
    }
  }, [clearPendingMarkers, setStagedErpUpload, toast]);

  // 미리보기 항목 개별 제외: 지도 임시 마커 + 스테이징 payload에서 함께 제거(적용에 반영되지 않도록).
  const excludeStagedMarker = useCallback(
    (id: string) => {
      removePendingMarkers("equipment", [id]);
      const staged = useMapMarkerStore.getState().stagedErpUpload;
      if (!staged) return;
      const markerRows = staged.markerRows.filter(
        (row) => String(row.id) !== id,
      );
      if (markerRows.length === 0) {
        setStagedErpUpload(null);
        return;
      }
      setStagedErpUpload({
        ...staged,
        markerRows,
        infoRows: staged.infoRows.filter((row) => String(row.marker_id) !== id),
        erpRows: staged.erpRows.filter((row) => String(row.marker_id) !== id),
      });
    },
    [removePendingMarkers, setStagedErpUpload],
  );

  const cancelPendingMarkers = useCallback(() => {
    if (!pendingMarkers.length) return;

    const confirmed = window.confirm(
      `대기 중인 ${pendingMarkers.length}개의 위치 마킹을 모두 취소하시겠습니까?`,
    );
    if (!confirmed) return;

    clearPendingMarkers(mode);
    toast({ description: "임시 대기 마커가 모두 삭제되었습니다." });
  }, [clearPendingMarkers, mode, pendingMarkers.length, toast]);

  // 구분 재정리: 저장된 대표/SUB/단독을 존중해 전체 재그룹(1개짜리 지번은 단독으로).
  const regroupMarkerRoles = useCallback(async () => {
    if (!isAuthenticated || !supabase) {
      toast({
        variant: "destructive",
        description: "구분 재정리는 로그인 후 사용할 수 있습니다.",
      });
      return;
    }
    if (!window.confirm("모든 장비 마커의 구분(대표/SUB/단독)을 재정리할까요?")) {
      return;
    }
    setIsUploading(true);
    setStatusText("구분 재정리 중...");
    try {
      const result = await applyMarkerRolesFromStoredGroupRole(supabase);
      await invalidateMarkers();
      toast({
        description: `구분을 재정리했습니다. 1개짜리 지번은 단독으로 변경됨 (그룹 ${result.groupCount} · 서브 ${result.subCount}).`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      toast({ variant: "destructive", description: `구분 재정리 실패: ${message}` });
    } finally {
      setIsUploading(false);
      setStatusText(null);
    }
  }, [isAuthenticated, supabase, toast, invalidateMarkers]);

  const submitPendingMarkers = useCallback(
    async (isTemp = false) => {
      const MapMarkerExcelManager = (
        await import("@/features/map-marker/lib/excel/data-manager")
      ).default;
      if (!pendingMarkers.length) return;

      if (!isTemp && !supabase) {
        toast({
          variant: "destructive",
          description: "Supabase가 연결되어 있지 않습니다.",
        });
        return;
      }

      setIsUploading(true);
      try {
        if (isTemp) {
          const tempMarkers = pendingMarkers.map((marker) => ({
            ...marker,
            isPending: false,
            isTemp: true,
            color: TEMP_MARKER_COLOR,
          }));
          removePendingMarkers(
            mode,
            pendingMarkers.map((marker) => marker.id),
          );
          addPendingMarkers(mode, tempMarkers);
          toast({
            description: `대기 마커 ${tempMarkers.length}개가 임시 마커(빨간색)로 등록되었습니다.`,
          });
          return;
        }

        const currentMode = useMapMarkerStore.getState().mode;
        if (currentMode === "battery") {
          const batteryPending = pendingMarkers as BatteryMarker[];
          const invalidCount = batteryPending.filter(
            (marker) =>
              !isValidCoordinate(marker.lat) || !isValidCoordinate(marker.lng),
          ).length;
          if (invalidCount > 0) {
            throw new Error(
              `좌표가 없는 축전지 마커 ${invalidCount}건이 있습니다. 주소 지오코딩을 확인하세요.`,
            );
          }

          const bulkMarkers = batteryPending.map((marker) => ({
            id: marker.id,
            name: marker.name,
            lat: marker.lat,
            lng: marker.lng,
            address: marker.address ?? "",
            memo: marker.memo ?? "",
            tags: marker.tags ?? [],
            color: resolveStoredMarkerColor(marker.color),
            facility_team: marker.facilityTeam ?? "",
            created_at: new Date().toISOString(),
          }));

          const { error } = await supabase!
            .from("battery_markers")
            .insert(bulkMarkers);
          if (error) throw error;

          const bulkSpecs = batteryPending.flatMap((marker) => {
            const specItems =
              Array.isArray(marker.items) && marker.items.length > 0
                ? marker.items
                : [
                    {
                      erpName: marker.memo ?? marker.name,
                      capacity: marker.capacity ?? 600,
                      quantity: marker.quantity ?? 12,
                      stationName: marker.stationName ?? marker.name,
                      createdAt: marker.createdAt,
                    },
                  ];

            return specItems.map((item) => ({
              marker_id: marker.id,
              erp_name: item.erpName || marker.memo || marker.name || "",
              capacity: Number(item.capacity) || Number(marker.capacity) || 600,
              quantity: Number(item.quantity) || Number(marker.quantity) || 12,
              station_name:
                item.stationName || marker.stationName || marker.name || "",
              created_at: item.createdAt
                ? new Date(item.createdAt).toISOString()
                : new Date().toISOString(),
            }));
          });

          if (bulkSpecs.length > 0) {
            const { error: specsError } = await supabase!
              .from("battery_specs")
              .insert(bulkSpecs);
            if (specsError) throw specsError;
          }
        } else {
          const equipmentPending = pendingMarkers as EquipmentMarker[];
          const bulkMarkers = equipmentPending.map((marker) => ({
            id: marker.id,
            name: marker.name,
            lat: marker.lat,
            lng: marker.lng,
            memo: marker.memo ?? "",
            tags: marker.tags ?? [],
            color: marker.color ?? DEFAULT_MARKER_COLOR,
            facility_team: marker.facilityTeam ?? "",
            facility_code: marker.facilityCode || null,
            road_address: marker.roadAddress ?? "",
            jibun_address: marker.jibunAddress ?? "",
            created_at: new Date().toISOString(),
          }));

          const { error: markerError } = await supabase!
            .from("markers")
            .insert(bulkMarkers);
          if (markerError) throw markerError;

          const bulkInfo = equipmentPending
            .filter((marker) => marker.facilityCode)
            .map((marker) => ({
              marker_id: marker.id,
              facility_code: marker.facilityCode,
              place_name: marker.name,
              facility_year: marker.facilityYear ?? "",
              project_code: marker.projectCode ?? "",
              business_type: marker.businessType ?? "",
              final_station_name: marker.finalStationName ?? "",
              eq_class: marker.eqClass ?? "",
              eq_type: marker.eqType ?? "",
              install_date: MapMarkerExcelManager.formatDateToYmd(
                marker.installDate ?? "",
              ),
              open_date: MapMarkerExcelManager.formatDateToYmd(
                marker.openDate ?? "",
              ),
            }));

          if (bulkInfo.length > 0) {
            const { error: infoError } = await supabase!
              .from("information")
              .upsert(bulkInfo);
            if (infoError) throw infoError;
          }
        }

        clearPendingMarkers(mode);
        setFilters({
          selectedYears: new Set(),
          selectedBusinesses: new Set(),
          selectedColors: new Set(),
          selectedTags: new Set(),
          selectedCapacities: new Set(),
          selectedQuantities: new Set(),
          selectedStations: new Set(),
        });
        await invalidateMarkers();
        toast({
          description: `성공적으로 ${pendingMarkers.length}개의 위치를 Supabase에 저장했습니다.`,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";
        toast({
          variant: "destructive",
          description: `일괄 등록 실패: ${message}`,
        });
      } finally {
        setIsUploading(false);
      }
    },
    [
      addPendingMarkers,
      clearPendingMarkers,
      invalidateMarkers,
      pendingMarkers,
      removePendingMarkers,
      mode,
      setFilters,
      supabase,
      toast,
    ],
  );

  const submitSinglePendingMarker = useCallback(
    async (markerId: string) => {
      const MapMarkerExcelManager = (
        await import("@/features/map-marker/lib/excel/data-manager")
      ).default;
      const marker = pendingMarkers.find((m) => m.id === markerId);
      if (!marker) return;

      if (!supabase) {
        toast({
          variant: "destructive",
          description: "Supabase가 연결되어 있지 않습니다.",
        });
        return;
      }

      setIsUploading(true);
      try {
        const currentMode = useMapMarkerStore.getState().mode;
        if (currentMode === "battery") {
          const bat = marker as BatteryMarker;
          if (!isValidCoordinate(bat.lat) || !isValidCoordinate(bat.lng)) {
            throw new Error(
              "좌표가 유효하지 않습니다. 주소 지오코딩을 확인하세요.",
            );
          }

          const dbMarker = {
            id: bat.id,
            name: bat.name,
            lat: bat.lat,
            lng: bat.lng,
            address: bat.address ?? "",
            memo: bat.memo ?? "",
            tags: bat.tags ?? [],
            color: resolveStoredMarkerColor(bat.color),
            facility_team: bat.facilityTeam ?? "",
            created_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from("battery_markers")
            .insert(dbMarker);
          if (error) throw error;

          const specItems =
            Array.isArray(bat.items) && bat.items.length > 0
              ? bat.items
              : [
                  {
                    erpName: bat.memo ?? bat.name,
                    capacity: bat.capacity ?? 600,
                    quantity: bat.quantity ?? 12,
                    stationName: bat.stationName ?? bat.name,
                    createdAt: bat.createdAt,
                  },
                ];

          const dbSpecs = specItems.map((item) => ({
            marker_id: bat.id,
            erp_name: item.erpName || bat.memo || bat.name || "",
            capacity: Number(item.capacity) || Number(bat.capacity) || 600,
            quantity: Number(item.quantity) || Number(bat.quantity) || 12,
            station_name: item.stationName || bat.stationName || bat.name || "",
            created_at: item.createdAt
              ? new Date(item.createdAt).toISOString()
              : new Date().toISOString(),
          }));

          const { error: specsError } = await supabase
            .from("battery_specs")
            .insert(dbSpecs);
          if (specsError) throw specsError;
        } else {
          const eq = marker as EquipmentMarker;
          const dbMarker = {
            id: eq.id,
            name: eq.name,
            lat: eq.lat,
            lng: eq.lng,
            memo: eq.memo ?? "",
            tags: eq.tags ?? [],
            color: eq.color ?? DEFAULT_MARKER_COLOR,
            facility_team: eq.facilityTeam ?? "",
            facility_code: eq.facilityCode || null,
            road_address: eq.roadAddress ?? "",
            jibun_address: eq.jibunAddress ?? "",
            created_at: new Date().toISOString(),
          };

          const { error: markerError } = await supabase
            .from("markers")
            .insert(dbMarker);
          if (markerError) throw markerError;

          if (eq.facilityCode) {
            const dbInfo = {
              marker_id: eq.id,
              facility_code: eq.facilityCode,
              place_name: eq.name,
              facility_year: eq.facilityYear ?? "",
              project_code: eq.projectCode ?? "",
              business_type: eq.businessType ?? "",
              final_station_name: eq.finalStationName ?? "",
              eq_class: eq.eqClass ?? "",
              eq_type: eq.eqType ?? "",
              install_date: MapMarkerExcelManager.formatDateToYmd(
                eq.installDate ?? "",
              ),
              open_date: MapMarkerExcelManager.formatDateToYmd(
                eq.openDate ?? "",
              ),
            };

            const { error: infoError } = await supabase
              .from("information")
              .upsert(dbInfo);
            if (infoError) throw infoError;
          }
        }

        // Remove from pending list
        removePendingMarkers(mode, [markerId]);
        await invalidateMarkers();
        toast({
          description: `"${marker.name}" 위치를 성공적으로 Supabase에 등록했습니다.`,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";
        toast({
          variant: "destructive",
          description: `개별 등록 실패: ${message}`,
        });
      } finally {
        setIsUploading(false);
      }
    },
    [
      pendingMarkers,
      supabase,
      toast,
      removePendingMarkers,
      mode,
      invalidateMarkers,
    ],
  );

  return {
    pendingCount: pendingMarkers.filter((marker) => marker.isPending).length,
    pendingMarkers,
    statusText,
    isUploading,
    uploadEquipmentExcel,
    uploadLocationExcel,
    uploadInfoExcel,
    uploadBatteryExcel,
    uploadErpExcel,
    // 위치등록 미리보기 → 적용 흐름
    prepareErpUpload,
    applyStagedErp,
    cancelStagedErp,
    excludeStagedMarker,
    stagedErpCount: stagedErpUpload?.markerRows.length ?? 0,
    cancelPendingMarkers,
    submitPendingMarkers,
    submitSinglePendingMarker,
    regroupMarkerRoles,
  };
}
