"use client";

import { type ReactNode, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_MARKER_COLOR,
  PENDING_MARKER_COLOR,
  TEMP_MARKER_COLOR,
} from "@/features/map-marker/constants/facility-teams";
import { MAP_MARKER_QUERY_KEY } from "@/features/map-marker/constants/map-config";
import { fetchAllRows } from "@/features/map-marker/api";
import type { ExistingMarkerRef } from "@/features/map-marker/lib/erp-classify";
import {
  geocodeAddressQueue,
  reverseGeocode,
  splitAddressFields,
} from "@/features/map-marker/lib/geocode";
import {
  createLocationMarkerFromExcelRow,
  resolveWeatherSiteForLocation,
} from "@/features/map-marker/lib/location-marker";
import { useMapMarkersQuery } from "@/features/map-marker/hooks/use-map-markers-query";
import type { ErpParsedRow } from "@/features/map-marker/lib/excel/data-manager/erp-parse";
import { applyMarkerRolesFromStoredGroupRole } from "@/features/map-marker/lib/address-group";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import {
  formatFailedAddresses,
  isValidCoordinate,
  parseErpSheet,
  resetFileInput,
  resolveStoredMarkerColor,
  stagedMarkerRowToPending,
  toEquipmentMarker,
  type ParsedExcelRow,
} from "@/features/map-marker/lib/excel-upload-helpers";
import type {
  BatteryMarker,
  EquipmentMarker,
  MarkerRecord,
  StagedErpUpload,
} from "@/features/map-marker/types/marker";

const FAILED_ADDRESS_DISPLAY_LIMIT = 10;

/** [확인]의 결과. 주소가 다르면 저장하지 않고 두 주소를 보여 준다. */
export type StagedConfirmResult =
  | { status: "saved" | "skipped" }
  | {
      status: "mismatch";
      lat: number;
      lng: number;
      /** 마커 위치의 주소. 찾지 못하면 null */
      actualAddress: string | null;
    };

/** 옛 양식은 저장 전에 막는다. 그대로 저장하면 기존 시설일·개통일이 지워진다. */
async function assertErpDateColumns(rows: ErpParsedRow[]) {
  const { findMissingErpDateColumns } = await import(
    "@/features/map-marker/lib/erp-classify"
  );
  const missing = findMissingErpDateColumns(rows);
  if (missing.length > 0) {
    throw new Error(
      `새 양식의 ${missing.join("·")} 열을 찾지 못해 중단했습니다. 파일의 날짜 열을 확인하세요.`,
    );
  }
}

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

export function useExcelUploadActions() {
  const { supabase, isAuthenticated } = useAuthSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: markersData } = useMapMarkersQuery();
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
  const addWeatherSites = useMapMarkerStore((state) => state.addWeatherSites);
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

  const invalidateMarkers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY });
  }, [queryClient]);

  const uploadEquipmentExcel = useCallback(
    async (file: File, input?: HTMLInputElement | null) => {
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
    [addPendingMarkers, isAuthenticated, pendingMarkers, toast],
  );

  /**
   * 장비 엑셀과 동일한 파서로 읽고, 위치 모드 마커로 지도에 올린다. (DB/로그인 불필요)
   * 대시보드의 오늘의 작업 국소 목록에도 함께 등록한다.
   */
  const uploadLocationExcel = useCallback(
    async (file: File, input?: HTMLInputElement | null) => {
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
        addWeatherSites(
          newMarkers.map((marker) =>
            resolveWeatherSiteForLocation(
              marker,
              markersData?.equipmentMarkers ?? [],
            ),
          ),
        );

        let summary = `위치 ${newMarkers.length}건이 지도와 대시보드에 표시되었습니다.`;
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
    [
      addPendingMarkers,
      addWeatherSites,
      markersData,
      pendingLocation,
      toast,
    ],
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
   * 위치등록(공정관리) 시트를 확인 대상과 기존 건으로 나눈다(DB 저장 없음).
   * 좌표가 필요한 행만 지오코딩하고, `previous`에 위치가 있는 행은 그 위치를 유지한다.
   */
  const buildErpUpload = useCallback(
    async (
      file: File,
      previous: Map<string, { lat: number; lng: number }>,
    ): Promise<StagedErpUpload> => {
      if (!supabase) throw new Error("Supabase가 연결되어 있지 않습니다.");

      const rows = await parseErpSheet(file);
      if (!rows.length) {
        throw new Error("가져올 수 있는 데이터가 없습니다.");
      }
      await assertErpDateColumns(rows);

      const existingMarkers = await fetchAllRows<ExistingMarkerRef>((from, to) =>
        supabase
          .from("markers")
          .select("id, facility_code, lat, lng", { count: "exact" })
          .order("id")
          .range(from, to),
      );
      const { stageErpRows } = await import("@/features/map-marker/lib/erp-staging");
      return stageErpRows({
        rows,
        existing: existingMarkers,
        previous,
        needsRegroup:
          useMapMarkerStore.getState().stagedErpUpload?.needsRegroup ?? false,
        onStatus: setStatusText,
      });
    },
    [supabase],
  );

  // "위치등록 업로드" 버튼: 저장하지 않고 확인 대상을 지도와 목록에 올린다.
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
        const state = useMapMarkerStore.getState();
        // 이어서 작업 중이면 사용자가 옮긴 위치를 새 파일에서도 유지한다.
        const previous = new Map(
          state.stagedErpUpload
            ? state.pendingEquipmentMarkers.map((marker) => [
                marker.id,
                { lat: marker.lat, lng: marker.lng },
              ])
            : [],
        );
        const upload = await buildErpUpload(file, previous);

        clearPendingMarkers("equipment");
        addPendingMarkers(
          "equipment",
          upload.reviewRows
            .filter((row) => row.lat !== null && row.lng !== null)
            .map(stagedMarkerRowToPending),
        );
        setStagedErpUpload(upload);

        let summary = `위치등록 파일을 불러왔습니다. 확인 대기 ${upload.reviewRows.length}건 · 기존 ${upload.existingRows.length}건`;
        if (upload.skippedRows.length > 0) {
          summary += ` · 저장 안 함 ${upload.skippedRows.length}건(코드·주소 없음)`;
        }
        toast({
          description: buildUploadResultDescription(
            summary,
            upload.geocodeFailedAddresses,
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
      buildErpUpload,
      addPendingMarkers,
      clearPendingMarkers,
      setStagedErpUpload,
    ],
  );

  // 건별 저장 뒤로 미뤄 둔 대표/SUB 재정리를 실행한다.
  const runPendingRegroup = useCallback(async () => {
    if (!supabase || !useMapMarkerStore.getState().stagedErpUpload?.needsRegroup) {
      return;
    }
    setStatusText("동일 번지 주소 대표·서브 취합 중...");
    await applyMarkerRolesFromStoredGroupRole(supabase);
    await invalidateMarkers();
    const latest = useMapMarkerStore.getState().stagedErpUpload;
    if (latest) {
      setStagedErpUpload({ ...latest, needsRegroup: false });
    }
  }, [supabase, invalidateMarkers, setStagedErpUpload]);

  // 남은 건이 없으면 재정리 후 대기 데이터를 닫는다.
  const closeReviewIfDone = useCallback(async () => {
    const staged = useMapMarkerStore.getState().stagedErpUpload;
    if (!staged || staged.reviewRows.length > 0 || staged.existingRows.length > 0) {
      return;
    }
    try {
      await runPendingRegroup();
    } catch (error) {
      // 저장은 이미 끝났다. 재정리 실패를 저장 실패로 보이지 않게 따로 알린다.
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      toast({
        variant: "destructive",
        description: `저장은 완료했지만 대표/SUB 재정리에 실패했습니다: ${message} [나중에 이어서]로 다시 실행하세요.`,
      });
      return;
    }
    setStagedErpUpload(null);
    // 저장한 마커가 필터에 가려지지 않도록 필터를 초기화한다.
    setFilters({
      selectedYears: new Set(),
      selectedBusinesses: new Set(),
      selectedStatuses: new Set(),
      selectedColors: new Set(),
      selectedTags: new Set(),
      selectedCapacities: new Set(),
      selectedQuantities: new Set(),
      selectedStations: new Set(),
    });
    toast({ description: "위치등록 작업을 모두 마쳤습니다." });
  }, [runPendingRegroup, setStagedErpUpload, setFilters, toast]);

  /**
   * 확인한 한 건을 저장한다. 마커 위치의 주소가 엑셀 주소와 다르면 저장하지 않고 알려 준다.
   * 사용자가 그래도 저장하기로 하면 `force`로 다시 부른다.
   */
  const confirmStagedMarker = useCallback(
    async (id: string, force = false): Promise<StagedConfirmResult> => {
      const state = useMapMarkerStore.getState();
      const row = state.stagedErpUpload?.reviewRows.find((item) => item.id === id);
      const marker = state.pendingEquipmentMarkers.find((item) => item.id === id);
      if (!row || !marker || !supabase) return { status: "skipped" };

      const coords = { lat: marker.lat, lng: marker.lng };
      setIsUploading(true);
      try {
        if (!force) {
          setStatusText("마커 위치의 주소 확인 중...");
          const [actual, { isSameAddress }] = await Promise.all([
            reverseGeocode(coords.lat, coords.lng),
            import("@/features/map-marker/lib/address-compare"),
          ]);
          if (!isSameAddress(row.address, actual)) {
            return {
              status: "mismatch",
              ...coords,
              actualAddress: actual
                ? [actual.jibunAddress, actual.roadAddress]
                    .filter(Boolean)
                    .join(" / ")
                : null,
            };
          }
        }

        setStatusText(`"${row.name}" 저장 중...`);
        const { saveReviewRow } = await import(
          "@/features/map-marker/lib/erp-review-save"
        );
        await saveReviewRow(supabase, row, coords);
        await invalidateMarkers();

        const latest = useMapMarkerStore.getState().stagedErpUpload;
        const remaining = (latest?.reviewRows ?? []).filter(
          (item) => item.id !== id,
        );
        removePendingMarkers("equipment", [id]);
        if (latest) {
          setStagedErpUpload({
            ...latest,
            reviewRows: remaining,
            needsRegroup: true,
          });
        }
        const next = remaining.find((item) => item.lat !== null);
        useMapMarkerStore.getState().setSelectedMarkerId(next?.id ?? null);

        toast({ description: `"${row.name}" 위치를 저장했습니다.` });
        await closeReviewIfDone();
        return { status: "saved" };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";
        toast({ variant: "destructive", description: `저장 실패: ${message}` });
        return { status: "skipped" };
      } finally {
        setIsUploading(false);
        setStatusText(null);
      }
    },
    [
      supabase,
      invalidateMarkers,
      removePendingMarkers,
      setStagedErpUpload,
      closeReviewIfDone,
      toast,
    ],
  );

  // 좌표가 있는 기존 건의 국소명과 공정 정보를 파일 값으로 갱신한다.
  const refreshStagedExisting = useCallback(async () => {
    const rows = useMapMarkerStore.getState().stagedErpUpload?.existingRows ?? [];
    if (!supabase || rows.length === 0) return;

    setIsUploading(true);
    setStatusText(`기존 ${rows.length}건 갱신 중...`);
    try {
      const { refreshExistingRows } = await import(
        "@/features/map-marker/lib/erp-review-save"
      );
      await refreshExistingRows(supabase, rows);
      await invalidateMarkers();
      const latest = useMapMarkerStore.getState().stagedErpUpload;
      if (latest) {
        setStagedErpUpload({ ...latest, existingRows: [] });
      }
      toast({ description: `기존 ${rows.length}건의 국소명과 공정 정보를 갱신했습니다.` });
      await closeReviewIfDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      toast({ variant: "destructive", description: `갱신 실패: ${message}` });
    } finally {
      setIsUploading(false);
      setStatusText(null);
    }
  }, [supabase, invalidateMarkers, setStagedErpUpload, closeReviewIfDone, toast]);

  // 작업을 멈춘다. 남은 건은 임시 저장에 그대로 두고, 저장한 건의 재정리만 마친다.
  const deferStagedReview = useCallback(async () => {
    setIsUploading(true);
    try {
      await runPendingRegroup();
      toast({
        description:
          "남은 건을 임시 저장했습니다. 이 브라우저로 다시 접속하면 이어서 할 수 있습니다.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      toast({ variant: "destructive", description: `재정리 실패: ${message}` });
    } finally {
      setIsUploading(false);
      setStatusText(null);
    }
  }, [runPendingRegroup, toast]);

  // 남은 건과 임시 저장을 버린다. 이미 저장한 건은 유지된다.
  const cancelStagedErp = useCallback(async () => {
    const count =
      useMapMarkerStore.getState().stagedErpUpload?.reviewRows.length ?? 0;
    if (
      count > 0 &&
      !window.confirm(
        `확인하지 않은 ${count}건과 옮긴 위치를 버릴까요? 이미 저장한 건은 그대로 남습니다.`,
      )
    ) {
      return;
    }

    setIsUploading(true);
    try {
      await runPendingRegroup();
      clearPendingMarkers("equipment");
      setStagedErpUpload(null);
      toast({ description: "위치등록 작업을 취소했습니다." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      toast({ variant: "destructive", description: `취소 실패: ${message}` });
    } finally {
      setIsUploading(false);
      setStatusText(null);
    }
  }, [runPendingRegroup, clearPendingMarkers, setStagedErpUpload, toast]);

  // 확인 목록에서 한 건을 뺀다. 다음에 같은 파일을 올리면 다시 신규로 나온다.
  const excludeStagedMarker = useCallback(
    async (id: string) => {
      removePendingMarkers("equipment", [id]);
      const staged = useMapMarkerStore.getState().stagedErpUpload;
      if (!staged) return;
      setStagedErpUpload({
        ...staged,
        reviewRows: staged.reviewRows.filter((row) => row.id !== id),
      });
      setIsUploading(true);
      try {
        await closeReviewIfDone();
      } finally {
        setIsUploading(false);
        setStatusText(null);
      }
    },
    [removePendingMarkers, setStagedErpUpload, closeReviewIfDone],
  );

  // 주소를 찾지 못한 건을 지도에서 찍은 위치에 놓는다.
  const placeStagedMarker = useCallback(
    (id: string, coords: { lat: number; lng: number }) => {
      const staged = useMapMarkerStore.getState().stagedErpUpload;
      const row = staged?.reviewRows.find((item) => item.id === id);
      if (!staged || !row) return;
      const placed = { ...row, ...coords };
      setStagedErpUpload({
        ...staged,
        reviewRows: staged.reviewRows.map((item) =>
          item.id === id ? placed : item,
        ),
      });
      removePendingMarkers("equipment", [id]);
      addPendingMarkers("equipment", [stagedMarkerRowToPending(placed)]);
    },
    [setStagedErpUpload, removePendingMarkers, addPendingMarkers],
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
          selectedStatuses: new Set(),
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
    uploadBatteryExcel,
    // 위치등록: 건별 확인 후 저장
    prepareErpUpload,
    confirmStagedMarker,
    refreshStagedExisting,
    deferStagedReview,
    cancelStagedErp,
    excludeStagedMarker,
    placeStagedMarker,
    stagedErpUpload,
    cancelPendingMarkers,
    submitPendingMarkers,
    submitSinglePendingMarker,
    regroupMarkerRoles,
  };
}
