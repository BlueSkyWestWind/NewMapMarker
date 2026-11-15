'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import { useMapMarkersQuery } from '@/features/map-marker/hooks/use-map-markers-query';
import { useMarkerList } from '@/features/map-marker/hooks/use-marker-list';
import { SiteListMembership } from '@/features/site-lists/components/site-list-membership';
import { useAuthSession } from '@/lib/auth/use-auth-session';
import { MAP_MARKER_QUERY_KEY } from '@/features/map-marker/constants/map-config';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { createLatestRequest } from '@/lib/latest-request';
import { useToast } from '@/hooks/use-toast';
import { useMarkerAddressDisplay } from '@/features/map-marker/hooks/use-marker-address-display';
import {
  Copy,
  Check,
  FileSpreadsheet,
  Lock,
} from 'lucide-react';
import { MarkerDetailGpsCard } from '@/features/map-marker/components/modals/marker-detail-gps-card';
import { MarkerDetailSubPlacement } from '@/features/map-marker/components/modals/marker-detail-sub-placement';
import { useMarkerGpsInfo } from '@/features/map-marker/hooks/use-marker-gps-info';
import { useMarkerGroupActions } from '@/features/map-marker/hooks/use-marker-group-actions';
import { useTableCellSelection } from '@/features/map-marker/hooks/use-table-cell-selection';
import {
  BATTERY_TABLE_HEADERS,
  EQUIPMENT_TABLE_HEADERS,
  batteryCopyCells,
  buildSelectionTsv,
  buildTableTsv,
  equipmentCopyCells,
} from '@/features/map-marker/lib/table-tsv';
import {
  GROUP_ROLE_REPRESENTATIVE,
  GROUP_ROLE_STANDALONE,
  GROUP_ROLE_SUB,
  normalizeGroupRole,
  type GroupRole,
} from '@/features/map-marker/lib/address-group';
import { buildDongGroups } from '@/features/map-marker/lib/marker-group-view';
import {
  buildEquipmentDetailRows,
  compareRelatedMarkers,
  getAddressGroupMates,
  getMarkerEffectiveKey,
  storedGroupRoleOf,
  type InfoRow,
} from '@/features/map-marker/lib/marker-detail-rows';
import type {
  BatteryMarker,
  BatterySpecItem,
  EquipmentMarker,
} from '@/features/map-marker/types/marker';

/** sticky 헤더: 불투명 배경으로 스크롤 행이 비치지 않게 함 */
const DETAIL_TABLE_STICKY_TH =
  'sticky top-0 z-10 whitespace-nowrap bg-slate-950 p-2 pr-3';
const DETAIL_TABLE_STICKY_TH_LAST =
  'sticky top-0 z-10 whitespace-nowrap bg-slate-950 p-2 pr-5';
const DETAIL_TABLE_TD =
  'whitespace-nowrap p-2 pr-3 border-r border-slate-800 transition-colors cursor-crosshair';
const DETAIL_TABLE_TD_LAST =
  'whitespace-nowrap p-2 pr-5 transition-colors cursor-crosshair';

export function MarkerDetailModal() {
  const isDetailOpen = useMapMarkerStore((state) => state.isDetailOpen);
  const selectedMarkerId = useMapMarkerStore((state) => state.selectedMarkerId);
  const closeAllModals = useMapMarkerStore((state) => state.closeAllModals);
  const storeMode = useMapMarkerStore((state) => state.mode);
  // 위치 메뉴의 마커는 장비 국소다.
  const mode = storeMode === 'location' ? 'equipment' : storeMode;
  
  // 목록만 필요하다. `useActiveMarkers`를 부르면 필터 부수효과가 중복 실행된다.
  const listedMarkers = useMarkerList();
  const { data: markersData } = useMapMarkersQuery();
  // 위치 메뉴는 고른 국소만 들고 있어, 같은 번지 정보는 전체 장비에서 찾는다.
  const markers = useMemo(
    () =>
      storeMode === 'location' ? (markersData?.equipmentMarkers ?? []) : listedMarkers,
    [storeMode, markersData, listedMarkers],
  );
  const marker = markers.find((m) => m.id === selectedMarkerId);
  const { toast } = useToast();

  // 현재 모드에 맞춰 좁힌 타입 뷰 (as any 제거용)
  const equipmentMarker =
    mode === 'equipment' ? (marker as EquipmentMarker | undefined) : undefined;
  const batteryMarker =
    mode === 'battery' ? (marker as BatteryMarker | undefined) : undefined;
  // 저장된 마커주소가 없으면 좌표를 주소로 바꿔 보여 준다(등록 주소와 같은 곳이면 그 주소).
  const markerAddressDisplay = useMarkerAddressDisplay(equipmentMarker);

  const [detailedInfo, setDetailedInfo] = useState<InfoRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 동일 번지 국소 개별 배치 섹션 펼침 여부
  const [openSubList, setOpenSubList] = useState(false);
  const { gpsInfo, gpsLoading, gpsError, openGps, toggleGps } = useMarkerGpsInfo(marker, {
    isDetailOpen,
    selectedMarkerId,
  });

  const {
    selectedCells,
    clearSelection,
    handleMouseDown,
    handleMouseOver,
    handleMouseUp,
  } = useTableCellSelection();
  const supabase = getSupabaseBrowserClient();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthSession();
  /**
   * 동일 번지 장비 목록(연관 상세·동 배치 공통).
   * 부모-자식 그룹 + 같은 번지 메이트를 합친다. 상세 표는 동 필터 없이 이 전체 사용.
   */
  const relatedEquipmentMarkers = useMemo(() => {
    if (mode !== 'equipment' || !equipmentMarker) {
      return [] as EquipmentMarker[];
    }

    const equipmentList = markers as EquipmentMarker[];
    const byId = new Map<string, EquipmentMarker>();

    if (equipmentMarker.parentMarkerId) {
      const parentId = equipmentMarker.parentMarkerId;
      const parent = equipmentList.find((item) => item.id === parentId);
      if (parent) byId.set(parent.id, parent);
      for (const item of equipmentList) {
        if (item.parentMarkerId === parentId) byId.set(item.id, item);
      }
      byId.set(equipmentMarker.id, equipmentMarker);
    } else {
      byId.set(equipmentMarker.id, equipmentMarker);
      for (const item of equipmentList) {
        if (item.parentMarkerId === equipmentMarker.id) {
          byId.set(item.id, item);
        }
      }
    }

    for (const mate of getAddressGroupMates(equipmentMarker, equipmentList)) {
      byId.set(mate.id, mate);
    }

    // G7 방어: 부모체인으로 끌려온 멤버 중 유효 키가 다른 것(경계 넘는 dangling
    // parent_marker_id)을 제외해, 화면·분리/합치기가 그룹 경계를 넘지 않게 한다.
    const selfKey = getMarkerEffectiveKey(equipmentMarker);
    const scoped = selfKey
      ? [...byId.values()].filter((m) => getMarkerEffectiveKey(m) === selfKey)
      : [...byId.values()];

    // 시설연도 내림차순(2027 → 2026)이 먼저, 같은 연도 안에서 대표 → 동 → 이름순.
    return scoped.sort(compareRelatedMarkers);
  }, [mode, equipmentMarker, markers]);

  /** 연관 상세 표 = 동일 번지 전체(동 개별 표시와 무관). */
  const detailEquipmentMarkers = relatedEquipmentMarkers;

  const groupActions = useMarkerGroupActions({ markers, relatedEquipmentMarkers });
  const { changingRoleId, changeMarkerGroupRole, setPickingSplitLabel } =
    groupActions;
  const toggleSubList = useCallback(() => setOpenSubList((v) => !v), []);

  const equipmentRows = useMemo(
    () => buildEquipmentDetailRows(detailEquipmentMarkers, detailedInfo),
    [detailEquipmentMarkers, detailedInfo],
  );

  useEffect(() => {
    if (!isDetailOpen || !marker || mode !== 'equipment' || !supabase) {
      setDetailedInfo([]);
      // 진행 중이던 조회는 cleanup에서 무효화돼 finally가 로딩 표시를 끄지 못한다. 여기서 끈다.
      setIsLoading(false);
      return;
    }

    const latest = createLatestRequest();
    const fetchDetail = async () => {
      const ticket = latest.begin();
      setIsLoading(true);
      try {
        const markerIds = relatedEquipmentMarkers.map((item) => item.id);
        const facilityCodes = relatedEquipmentMarkers
          .map((item) => item.facilityCode)
          .filter(Boolean);

        let infoRows: InfoRow[] = [];

        if (markerIds.length > 0) {
          const { data, error } = await supabase
            .from('information')
            .select('*')
            .in('marker_id', markerIds);
          if (error) throw error;
          infoRows = (data as InfoRow[]) || [];
        }

        if (facilityCodes.length > 0) {
          const { data, error } = await supabase
            .from('information')
            .select('*')
            .in('facility_code', facilityCodes);
          if (error) throw error;
          const byKey = new Set(
            infoRows.map(
              (row) =>
                `${row.marker_id ?? ''}|${row.facility_code ?? ''}|${row.final_station_name ?? ''}`,
            ),
          );
          for (const row of (data as InfoRow[]) || []) {
            const key = `${row.marker_id ?? ''}|${row.facility_code ?? ''}|${row.final_station_name ?? ''}`;
            if (!byKey.has(key)) {
              byKey.add(key);
              infoRows.push(row);
            }
          }
        }

        if (!ticket.isCurrent()) return;
        // 행 조립(국소 1건=1행)은 buildEquipmentDetailRows 가 담당.
        // 여기서 facility_code/마커 합성으로 미리 채우면 중복·누락이 생긴다.
        setDetailedInfo(infoRows);
      } catch (err) {
        if (!ticket.isCurrent()) return;
        console.error('연관 상세 정보 조회 실패:', err);
        setDetailedInfo([]);
      } finally {
        if (ticket.isCurrent()) {
          setIsLoading(false);
        }
      }
    };

    fetchDetail();
    clearSelection();
    return () => {
      latest.invalidate();
    };
  }, [
    clearSelection,
    isDetailOpen,
    selectedMarkerId,
    mode,
    marker,
    supabase,
    relatedEquipmentMarkers,
  ]);

  // 마커/모달이 바뀌면 섹션을 접는다(펼치기로 다시 연다).
  useEffect(() => {
    setOpenSubList(false);
    setPickingSplitLabel(null);
  }, [isDetailOpen, selectedMarkerId, setPickingSplitLabel]);

  // 클립보드 복사 헬퍼
  const writeTsvToClipboard = async (tsvText: string, message: string) => {
    try {
      await navigator.clipboard.writeText(tsvText);
      toast({ description: message });
    } catch {
      toast({ variant: 'destructive', description: '클립보드 복사에 실패했습니다.' });
    }
  };

  const resolveRowGroupRole = (row: InfoRow): string => {
    const rowMarker = detailEquipmentMarkers.find(
      (item) => item.id === row.marker_id,
    );
    if (rowMarker) return storedGroupRoleOf(rowMarker);
    return normalizeGroupRole(row.group_role) || row.group_role || '';
  };

  // 표 전체 복사
  const handleCopyTable = () => {
    const tsvContent =
      mode === 'equipment'
        ? buildTableTsv(
            EQUIPMENT_TABLE_HEADERS,
            equipmentRows.map((row) => equipmentCopyCells(row, resolveRowGroupRole(row))),
          )
        : buildTableTsv(
            BATTERY_TABLE_HEADERS,
            (batteryMarker?.items || []).map(batteryCopyCells),
          );
    writeTsvToClipboard(tsvContent, '표 전체 내용이 클립보드에 복사되었습니다.');
  };

  const getCellValue = (r: number, c: number): string => {
    if (mode === 'equipment') {
      const row = equipmentRows[r];
      return row ? (equipmentCopyCells(row, resolveRowGroupRole(row))[c] ?? '') : '';
    }
    const item = (batteryMarker?.items || [])[r];
    return item ? (batteryCopyCells(item)[c] ?? '') : '';
  };

  // 선택 셀 복사
  const handleCopySelected = () => {
    if (selectedCells.size === 0) return;
    writeTsvToClipboard(
      buildSelectionTsv(selectedCells, getCellValue),
      '선택한 셀 내용이 클립보드에 복사되었습니다.',
    );
  };

  // SUB 국소를 동(棟)별로 묶는다. 동당 지도 핀은 최대 1개.
  const dongGroups = useMemo(
    () => buildDongGroups(relatedEquipmentMarkers),
    [relatedEquipmentMarkers],
  );

  const dongDetachedSummary = dongGroups
    .map(
      (group) =>
        `${group.label}:${group.subs.filter((s) => s.detachedVisible).length}`,
    )
    .join('|');

  // 과거에 동 내 여러 핀이 켜져 있으면 대표 1개만 남기도록 정리한다.
  useEffect(() => {
    if (!isDetailOpen || !supabase || !isAuthenticated || mode !== 'equipment') {
      return;
    }

    const hideIds: string[] = [];
    for (const group of dongGroups) {
      const detachedSubs = group.subs.filter((sub) => sub.detachedVisible);
      if (detachedSubs.length <= 1) continue;
      const repId = group.mapRepId;
      for (const sub of detachedSubs) {
        if (sub.id !== repId) hideIds.push(sub.id);
      }
    }
    if (hideIds.length === 0) return;

    let cancelled = false;
    const normalize = async () => {
      const { error } = await supabase
        .from('markers')
        .update({ detached_visible: false })
        .in('id', hideIds);
      if (cancelled || error) return;
      await queryClient.invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY });
    };
    void normalize();
    return () => {
      cancelled = true;
    };
  }, [
    isDetailOpen,
    isAuthenticated,
    mode,
    supabase,
    queryClient,
    dongGroups,
    dongDetachedSummary,
  ]);

  if (!marker) return null;

  const color = marker.color || '#10b981';
  const subCount = Math.max(relatedEquipmentMarkers.length - 1, 0);

  return (
    <Dialog open={isDetailOpen} onOpenChange={(open) => !open && closeAllModals()}>
      <DialogContent className="flex max-h-[90vh] w-max max-w-[98vw] flex-col gap-0 overflow-hidden bg-slate-900 border-slate-800 p-0 text-slate-100 shadow-2xl rounded-2xl">
        <div className="shrink-0 border-b border-slate-800 px-6 pb-4 pt-6 pr-12">
          <DialogHeader className="flex flex-row items-center gap-3 space-y-0 text-left">
            <div className="h-4 w-4 rounded-full" style={{ backgroundColor: color }} />
            <DialogTitle className="text-lg font-semibold text-slate-100">
              마커 상세 정보
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 [scrollbar-gutter:stable]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* 기본 정보 */}
            <div className="space-y-3 rounded-lg border border-slate-800/80 bg-slate-950/40 p-4">
              <h4 className="text-xs font-medium text-slate-400">기본 정보</h4>
              <div>
                <label className="text-[11px] font-medium text-slate-500">장소 이름</label>
                <div className="mt-0.5 text-sm font-semibold text-slate-200">{marker.name}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-slate-500">위도</label>
                  <div className="mt-0.5 font-mono text-xs">{marker.lat}</div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500">경도</label>
                  <div className="mt-0.5 font-mono text-xs">{marker.lng}</div>
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500">메모</label>
                <div className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                  {marker.memo || '입력된 메모가 없습니다.'}
                </div>
              </div>
            </div>

            {/* 주소 및 부가정보 */}
            <div className="space-y-3 rounded-lg border border-slate-800/80 bg-slate-950/40 p-4">
              <h4 className="text-xs font-medium text-slate-400">위치 정보</h4>
              <div>
                <label className="text-[11px] font-medium text-slate-500">
                  {mode === 'equipment' ? '지번' : '주소'}
                </label>
                <div className="mt-0.5 text-xs text-slate-200">
                  {mode === 'equipment'
                    ? equipmentMarker?.jibunAddress || '주소 정보 없음'
                    : batteryMarker?.address || '주소 정보 없음'}
                </div>
              </div>
              {mode === 'equipment' ? (
                <div>
                  <label className="text-[11px] font-medium text-slate-500">도로명</label>
                  <div className="mt-0.5 text-xs text-slate-300">
                    {markerAddressDisplay.isLoading
                      ? '확인 중…'
                      : markerAddressDisplay.roadText || '도로명 주소 없음'}
                  </div>
                </div>
              ) : null}
              {mode === 'equipment' ? (
                <div>
                  <label className="text-[11px] font-medium text-slate-500">마커주소</label>
                  <div className="mt-0.5 text-xs text-slate-300">
                    {markerAddressDisplay.isLoading
                      ? '확인 중…'
                      : markerAddressDisplay.text || '저장된 마커주소 없음'}
                  </div>
                </div>
              ) : null}
              <div>
                <label className="text-[11px] font-medium text-slate-500">태그</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {marker.tags && marker.tags.length > 0 ? (
                    marker.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="rounded-full border border-slate-700/55 bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300"
                      >
                        #{tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">지정된 태그가 없습니다.</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {mode === 'equipment' && marker ? <SiteListMembership markerId={marker.id} /> : null}

          {/* GPSMAP 좌표·주소 변환 + 건축물대장 — 하나의 펼치기·숨기기 */}
          {mode === 'equipment' ? (
            <MarkerDetailGpsCard
              gpsInfo={gpsInfo}
              gpsLoading={gpsLoading}
              gpsError={gpsError}
              open={openGps}
              onToggle={toggleGps}
            />
          ) : null}

          {/* 같은 번지 국소 개별 배치 (드래그로 실위치 지정) */}
          {mode === 'equipment' && equipmentMarker ? (
            <MarkerDetailSubPlacement
              actions={groupActions}
              equipmentMarker={equipmentMarker}
              relatedEquipmentMarkers={relatedEquipmentMarkers}
              dongGroups={dongGroups}
              subCount={subCount}
              openSubList={openSubList}
              onToggleSubList={toggleSubList}
            />
          ) : null}

          {/* 상세 스펙/장비 정보 테이블 */}
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-300">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-400" />
              <span className="truncate">
                {mode === 'equipment'
                  ? `연관 상세 장비 목록${
                      equipmentRows.length > 1 || subCount > 0
                        ? ` (동일 번지 ${equipmentRows.length}건)`
                        : ''
                    }`
                  : '연관 축전지 상세 사양'}
              </span>
              <span className="hidden items-center gap-1 text-[11px] font-normal text-slate-500 sm:flex">
                <Lock className="h-2.5 w-2.5" />
                셀 드래그 선택 후 복사 지원
              </span>
            </h4>
            <div className="flex shrink-0 gap-2">
              {selectedCells.size > 0 && (
                <button
                  onClick={handleCopySelected}
                  className="flex items-center gap-1 rounded-lg border border-emerald-500/50 bg-emerald-600/20 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-600/30"
                >
                  <Check className="h-3 w-3" />
                  선택 셀 복사
                </button>
              )}
              <button
                onClick={handleCopyTable}
                className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:bg-slate-700"
              >
                <Copy className="h-3 w-3" />
                표 전체 복사
              </button>
            </div>
          </div>

          <div className="max-h-[min(30vh,280px)] overflow-y-auto overflow-x-hidden rounded-lg border border-slate-800 [scrollbar-gutter:stable]">
            <table className="border-collapse text-left text-xs text-slate-300 select-none">
              <thead className="text-slate-400 font-semibold border-b border-slate-800">
                {mode === 'equipment' ? (
                  <tr>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>구분</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>시설연도</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>프로젝트코드</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>통합시설코드</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>사업구분</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>국소명-최종</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>장비타입</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>시설일</th>
                    <th className={DETAIL_TABLE_STICKY_TH_LAST}>개통일</th>
                  </tr>
                ) : (
                  <tr>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>ERP명</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>주소</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>용량(AH)</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>수량(Cell)</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>창고/국소/국사명</th>
                    <th className={DETAIL_TABLE_STICKY_TH_LAST}>등록일</th>
                  </tr>
                )}
              </thead>
              <tbody onMouseUp={handleMouseUp}>
                {isLoading ? (
                  <tr>
                    <td colSpan={mode === 'equipment' ? 9 : 6} className="text-center p-6 text-slate-500 font-medium">
                      상세 정보를 로드하는 중...
                    </td>
                  </tr>
                ) : mode === 'equipment' ? (
                  equipmentRows.map((row, rIdx) => {
                    const rowMarker = detailEquipmentMarkers.find(
                      (item) => item.id === row.marker_id,
                    );
                    const roleValue = rowMarker
                      ? storedGroupRoleOf(rowMarker)
                      : normalizeGroupRole(row.group_role) ||
                        GROUP_ROLE_SUB;
                    const cells = [
                      null, // 구분: select로 렌더
                      row.facility_year,
                      row.project_code,
                      row.facility_code,
                      row.business_type,
                      row.final_station_name,
                      row.eq_type,
                      row.install_date ? row.install_date.split('T')[0] : '',
                      row.open_date ? row.open_date.split('T')[0] : '',
                    ];
                    const lastIdx = cells.length - 1;
                    return (
                      <tr key={rIdx} className="border-b border-slate-800 hover:bg-slate-850/40">
                        {cells.map((val, cIdx) => {
                          const isSel = selectedCells.has(`${rIdx},${cIdx}`);
                          const isLast = cIdx === lastIdx;
                          const cellClass = `${isLast ? DETAIL_TABLE_TD_LAST : DETAIL_TABLE_TD} ${isSel ? 'bg-blue-900/30 text-blue-200' : ''}`;

                          if (cIdx === 0) {
                            return (
                              <td
                                key={cIdx}
                                className={cellClass}
                                onMouseDown={(event) => event.stopPropagation()}
                              >
                                {rowMarker ? (
                                  <select
                                    value={roleValue}
                                    disabled={
                                      !isAuthenticated ||
                                      changingRoleId === rowMarker.id
                                    }
                                    title={
                                      isAuthenticated
                                        ? '구분 변경'
                                        : '로그인 후 변경 가능'
                                    }
                                    onClick={(event) => event.stopPropagation()}
                                    onMouseDown={(event) =>
                                      event.stopPropagation()
                                    }
                                    onChange={(event) => {
                                      event.stopPropagation();
                                      void changeMarkerGroupRole(
                                        rowMarker.id,
                                        event.target.value as GroupRole,
                                      );
                                    }}
                                    className="max-w-[5.5rem] rounded-sm border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] font-medium text-slate-100 outline-none focus:border-emerald-500/60 disabled:opacity-50"
                                  >
                                    <option value={GROUP_ROLE_REPRESENTATIVE}>
                                      대표
                                    </option>
                                    <option value={GROUP_ROLE_STANDALONE}>
                                      단독
                                    </option>
                                    <option value={GROUP_ROLE_SUB}>SUB</option>
                                  </select>
                                ) : (
                                  row.group_role || '-'
                                )}
                              </td>
                            );
                          }

                          return (
                            <td
                              key={cIdx}
                              onMouseDown={() => handleMouseDown(rIdx, cIdx)}
                              onMouseOver={() => handleMouseOver(rIdx, cIdx)}
                              className={cellClass}
                            >
                              {val}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                ) : (
                  // 축전지 목록
                  (batteryMarker?.items || []).map((item: BatterySpecItem, rIdx: number) => {
                    const cells = [
                      item.erpName,
                      item.address,
                      item.capacity,
                      item.quantity,
                      item.stationName,
                      item.createdAt ? item.createdAt.split('T')[0] : '',
                    ];
                    const lastIdx = cells.length - 1;
                    return (
                      <tr key={rIdx} className="border-b border-slate-800 hover:bg-slate-850/40">
                        {cells.map((val, cIdx) => {
                          const isSel = selectedCells.has(`${rIdx},${cIdx}`);
                          const isLast = cIdx === lastIdx;
                          return (
                            <td
                              key={cIdx}
                              onMouseDown={() => handleMouseDown(rIdx, cIdx)}
                              onMouseOver={() => handleMouseOver(rIdx, cIdx)}
                              className={`${isLast ? DETAIL_TABLE_TD_LAST : DETAIL_TABLE_TD} ${isSel ? 'bg-blue-900/30 text-blue-200' : ''}`}
                            >
                              {val}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
