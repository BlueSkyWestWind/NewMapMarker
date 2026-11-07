"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useMapMarkersQuery } from "@/features/map-marker/hooks/use-map-markers-query";
import {
  DAY_QUERY_KEY,
  fetchDayDetails,
  fetchErpRefs,
  fetchLatestArchive,
  saveArchiveRows,
  upsertDayDetails,
} from "@/features/schedule/day-api";
import { LATEST_ARCHIVE_QUERY_KEY } from "@/features/schedule/hooks/use-archive";
import { useScheduleRange } from "@/features/schedule/hooks/use-schedule-range";
import { archiveValuesToRef, markerToRef } from "@/features/schedule/lib/day-reference";
import { rowsToArchive } from "@/features/schedule/lib/day-archive";
import { mergeDetailPatch } from "@/features/schedule/lib/day-details";
import { buildDayRows, type DayRow } from "@/features/schedule/lib/day-rows";
import { buildDayStations, stationKey } from "@/features/schedule/lib/day-stations";
import type {
  ArchiveRow,
  DayDetail,
  DayDetailPatch,
  RefValues,
} from "@/features/schedule/lib/day-types";
import { isScheduleTableMissing } from "@/features/schedule/lib/table-missing";

const DETAILS_QUERY_KEY = [...DAY_QUERY_KEY, "details"] as const;
const ERP_QUERY_KEY = [...DAY_QUERY_KEY, "erp"] as const;

const NO_DETAILS: DayDetail[] = [];
const NO_ARCHIVE: Map<string, ArchiveRow> = new Map();
const NO_REFS: Map<string, RefValues> = new Map();

interface DetailsResult {
  details: DayDetail[];
  /** 마이그레이션 전이라 테이블이 없다 */
  tableMissing: boolean;
}

interface ArchiveResult {
  latest: Map<string, ArchiveRow>;
  tableMissing: boolean;
}

/**
 * 그날(`workDate`, `yyyy-mm-dd`)의 일자별 상세표. 일정(`useScheduleRange`)의 국소마다 한 행을 만들고,
 * 참조 값은 공정관리(`erp_details`) → 누적 → 마커·정보 순으로 찾는다.
 * 일자별 테이블이 아직 없으면 오류로 만들지 않고 `isTableMissing`을 켠다(일정표는 계속 열린다).
 */
export function useDaySheet(workDate: string) {
  const { supabase, user } = useAuthSession();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const range = useScheduleRange(workDate, workDate);
  const markersQuery = useMapMarkersQuery();
  const equipmentMarkers = markersQuery.data?.equipmentMarkers;
  const { columns, cells, isAdmin } = range;

  const stations = useMemo(
    () => buildDayStations({ workDate, columns, cells }),
    [workDate, columns, cells],
  );
  const sites = useMemo(() => stations.map((station) => station.site), [stations]);
  const stationKeys = useMemo(() => stations.map((station) => station.key), [stations]);
  const hasStations = stations.length > 0;

  const detailsQuery = useQuery<DetailsResult>({
    queryKey: [...DETAILS_QUERY_KEY, userId, workDate],
    queryFn: async () => {
      try {
        return { details: await fetchDayDetails(supabase!, workDate), tableMissing: false };
      } catch (error) {
        if (isScheduleTableMissing(error)) return { details: NO_DETAILS, tableMissing: true };
        throw error;
      }
    },
    enabled: Boolean(supabase && userId),
    staleTime: (current) => (current.state.data?.tableMissing ? 0 : 5 * 60_000),
    refetchOnWindowFocus: false,
    retry: false,
  });

  const erpQuery = useQuery({
    queryKey: [...ERP_QUERY_KEY, userId, sites],
    queryFn: () => fetchErpRefs(supabase!, sites),
    enabled: Boolean(supabase && userId) && hasStations,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const archiveQuery = useQuery<ArchiveResult>({
    queryKey: [...LATEST_ARCHIVE_QUERY_KEY, userId, workDate, stationKeys],
    queryFn: async () => {
      try {
        // 보고 있는 날보다 앞선 행만 참조한다(그날 자신의 저장본은 제외).
        return { latest: await fetchLatestArchive(supabase!, stationKeys, workDate), tableMissing: false };
      } catch (error) {
        if (isScheduleTableMissing(error)) return { latest: NO_ARCHIVE, tableMissing: true };
        throw error;
      }
    },
    enabled: Boolean(supabase && userId) && hasStations,
    staleTime: (current) => (current.state.data?.tableMissing ? 0 : 5 * 60_000),
    refetchOnWindowFocus: false,
    retry: false,
  });

  const details = useMemo(
    () => new Map((detailsQuery.data?.details ?? NO_DETAILS).map((detail) => [detail.stationKey, detail])),
    [detailsQuery.data],
  );
  const latestArchive = archiveQuery.data?.latest ?? NO_ARCHIVE;

  const archiveRefs = useMemo(
    () => new Map([...latestArchive].map(([key, row]) => [key, archiveValuesToRef(row.values)])),
    [latestArchive],
  );

  // 일정의 국소 이름과 마커의 최종 국소명·이름이 같은 마커의 값. 최종 국소명 일치가 먼저다.
  const markerRefs = useMemo(() => {
    const refs = new Map<string, RefValues>();
    if (!equipmentMarkers || !hasStations) return refs;
    const wanted = new Set(stationKeys);
    for (const pick of ["finalStationName", "name"] as const) {
      for (const marker of equipmentMarkers) {
        const key = stationKey(marker[pick] ?? "");
        if (key === "" || !wanted.has(key) || refs.has(key)) continue;
        refs.set(key, markerToRef(marker));
      }
    }
    return refs;
  }, [equipmentMarkers, hasStations, stationKeys]);

  const rows = useMemo(
    () =>
      buildDayRows({
        workDate,
        columns,
        cells,
        details,
        refs: { erp: erpQuery.data ?? NO_REFS, archive: archiveRefs, marker: markerRefs },
      }),
    [workDate, columns, cells, details, erpQuery.data, archiveRefs, markerRefs],
  );

  const saveDetails = useCallback(
    async (patches: { station: DayRow; patch: DayDetailPatch }[]) => {
      if (!supabase) throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
      if (patches.length === 0) return;
      // 캐시된 값이 아니라 저장 시점의 DB 행에 합친다(다른 관리자의 수정·연달아 한 저장을 덮지 않도록).
      const fresh = new Map(
        (await fetchDayDetails(supabase, workDate)).map((detail) => [detail.stationKey, detail]),
      );
      const next = new Map<string, DayDetail>();
      for (const { station, patch } of patches) {
        const key = { workDate, stationKey: station.stationKey, site: station.site };
        next.set(
          station.stationKey,
          mergeDetailPatch(next.get(station.stationKey) ?? fresh.get(station.stationKey), key, patch),
        );
      }
      await upsertDayDetails(supabase, [...next.values()]);
      await queryClient.invalidateQueries({ queryKey: DETAILS_QUERY_KEY });
    },
    [supabase, workDate, queryClient],
  );

  const saveArchive = useCallback(async () => {
    // 쓰기는 관리자만. 일정이 비어 있으면 저장할 것이 없다.
    if (!isAdmin || !supabase || rows.length === 0) return;
    await saveArchiveRows(supabase, workDate, rowsToArchive(workDate, rows, new Date().toISOString()));
    await queryClient.invalidateQueries({ queryKey: [...DAY_QUERY_KEY, "archive"] });
    await queryClient.invalidateQueries({ queryKey: LATEST_ARCHIVE_QUERY_KEY });
  }, [isAdmin, supabase, rows, workDate, queryClient]);

  const rangeError = isScheduleTableMissing(range.error) ? null : range.error;
  return {
    rows,
    details,
    // 날짜를 넘기는 동안 `useScheduleRange`는 이전 기간 데이터를 자리표시로 들고 있어 isLoaded로 판단한다.
    isLoading:
      (!range.isLoaded && !range.error) ||
      detailsQuery.isLoading ||
      erpQuery.isLoading ||
      archiveQuery.isLoading,
    error: rangeError ?? detailsQuery.error ?? erpQuery.error ?? archiveQuery.error,
    isTableMissing:
      range.isTableMissing ||
      Boolean(detailsQuery.data?.tableMissing) ||
      Boolean(archiveQuery.data?.tableMissing),
    saveDetails,
    saveArchive,
    latestArchive,
  };
}
