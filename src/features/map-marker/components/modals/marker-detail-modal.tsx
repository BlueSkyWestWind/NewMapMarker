'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import { useActiveMarkers } from '@/features/map-marker/hooks/use-active-markers';
import { useAuthSession } from '@/features/map-marker/hooks/use-auth-session';
import { MAP_MARKER_QUERY_KEY } from '@/features/map-marker/constants/map-config';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Copy,
  Check,
  FileSpreadsheet,
  Lock,
  MapPin,
  Building2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { runSingleLookup, type GpsLookupResult } from '@/features/gpsmap/lib/lookup';
import {
  GROUP_ROLE_REPRESENTATIVE,
  GROUP_ROLE_STANDALONE,
  GROUP_ROLE_SUB,
  buildSplitGroupKey,
  getLotAddressKey,
  normalizeGroupRole,
  type GroupRole,
} from '@/features/map-marker/lib/address-group';
import type {
  BatteryMarker,
  BatterySpecItem,
  EquipmentMarker,
} from '@/features/map-marker/types/marker';

interface InfoRow {
  marker_id?: string | null;
  group_role?: string;
  facility_year?: string;
  project_code?: string;
  facility_code?: string;
  business_type?: string;
  final_station_name?: string;
  eq_type?: string;
  install_date?: string;
  open_date?: string;
}

/** sticky 헤더: 불투명 배경으로 스크롤 행이 비치지 않게 함 */
const DETAIL_TABLE_STICKY_TH =
  'sticky top-0 z-10 whitespace-nowrap bg-slate-950 p-2 pr-3';
const DETAIL_TABLE_STICKY_TH_LAST =
  'sticky top-0 z-10 whitespace-nowrap bg-slate-950 p-2 pr-5';
const DETAIL_TABLE_TD =
  'whitespace-nowrap p-2 pr-3 border-r border-slate-800 transition-colors cursor-crosshair';
const DETAIL_TABLE_TD_LAST =
  'whitespace-nowrap p-2 pr-5 transition-colors cursor-crosshair';

/** GPSMAP 좌표·주소 변환 / 건축물대장 카드의 라벨-값 한 행. 조회 중이면 '…', 값 없으면 '-'. */
function GpsInfoRow({
  label,
  value,
  loading,
}: {
  label: string;
  value?: string;
  loading: boolean;
}) {
  return (
    <tr className="border-b border-slate-800/60 last:border-0">
      <th className="w-24 whitespace-nowrap py-1 pr-2 text-left align-top font-medium text-slate-500">
        {label}
      </th>
      <td className="break-all py-1 text-slate-200">
        {loading ? '…' : value || '-'}
      </td>
    </tr>
  );
}

/** detached_visible 관련 Supabase 오류를 사용자 문구로. 컬럼 미존재면 마이그레이션 안내. */
function dbErrorMessage(err: unknown, fallback: string): string {
  const e = err as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };
  const detail = e?.message || e?.details || e?.hint || e?.code || '';
  const missingColumn =
    /detached_visible/i.test(detail) ||
    e?.code === 'PGRST204' ||
    e?.code === '42703';
  if (missingColumn) {
    return "DB에 'detached_visible' 컬럼이 아직 없습니다. 마이그레이션(20260722000000_add_detached_visible.sql)을 Supabase에 적용해 주세요.";
  }
  return `${fallback}${detail ? ` (${detail})` : ''}`;
}

const BASEMENT_LABEL = '지하';
const ETC_DONG_LABEL = '기타';

/**
 * 국소명에서 분리 라벨을 뽑는다(범용 — 아파트 동/공장 구역 등).
 * - `…121동옥상…` → `121동`
 * - `지하`/`B1` 등 → `지하`
 * - 그 외 → null → 호출부에서 "기타" 그룹으로 묶는다.
 */
function parseSeparationLabel(name: string | undefined | null): string | null {
  if (!name) return null;
  const dong = /(\d+)\s*동/.exec(name);
  if (dong) return `${dong[1]}동`;
  if (/지하|(?:^|[^A-Za-z])[Bb]\d/.test(name)) return BASEMENT_LABEL;
  return null;
}

/** 분리 라벨 정렬용 숫자 키. 동 < 지하 < 기타. */
function dongSortKey(label: string): number {
  if (label === ETC_DONG_LABEL) return Number.POSITIVE_INFINITY;
  if (label === BASEMENT_LABEL) return Number.MAX_SAFE_INTEGER;
  return Number.parseInt(label, 10);
}

function getMarkerDongLabel(marker: EquipmentMarker): string {
  return (
    parseSeparationLabel(marker.finalStationName || marker.name) ??
    ETC_DONG_LABEL
  );
}

/** 마커의 유효 그룹 키(분리 group_key 우선, 없으면 번지 키). address-group.getEffectiveGroupKey와 동일 규칙. */
function getMarkerEffectiveKey(marker: EquipmentMarker): string {
  const manual = marker.groupKey?.trim();
  if (manual) return manual;
  return getLotAddressKey(marker.roadAddress || marker.jibunAddress || '');
}

/**
 * 같은 동에서 지도에 올릴 대표 국소 1개.
 * 이미 개별 표시 중인 국소가 있으면 그중 이름순 첫 국소, 없으면 전체 중 이름·id 순 첫 국소.
 */
function pickDongMapRepresentative(
  subs: EquipmentMarker[],
): EquipmentMarker | null {
  if (subs.length === 0) return null;
  const detached = subs.filter((sub) => sub.detachedVisible);
  const pool = detached.length > 0 ? detached : subs;
  return [...pool].sort((a, b) => {
    const nameCmp = (a.finalStationName || a.name).localeCompare(
      b.finalStationName || b.name,
      'ko',
    );
    if (nameCmp !== 0) return nameCmp;
    return a.id.localeCompare(b.id);
  })[0];
}

/** DB·부모 관계 기준 실제 구분 값. */
function storedGroupRoleOf(marker: EquipmentMarker): GroupRole {
  const normalized = normalizeGroupRole(marker.groupRole);
  if (normalized) return normalized;
  if (marker.parentMarkerId) return GROUP_ROLE_SUB;
  return GROUP_ROLE_REPRESENTATIVE;
}

/**
 * 같은 유효 그룹(번지 또는 분리된 group_key)에 속한 장비 국소 목록.
 * 분리(group_key)된 그룹은 같은 번지라도 서로 다른 그룹으로 취급한다.
 */
function getAddressGroupMates(
  target: EquipmentMarker,
  all: EquipmentMarker[],
): EquipmentMarker[] {
  const key = getMarkerEffectiveKey(target);
  if (!key) return [target];
  const mates = all.filter((marker) => getMarkerEffectiveKey(marker) === key);
  return mates.length > 0 ? mates : [target];
}

/** 같은 번지에서 다음 대표 후보(이름·id 순). */
function pickNextAddressRepresentative(
  candidates: EquipmentMarker[],
): EquipmentMarker | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const nameCmp = (a.finalStationName || a.name).localeCompare(
      b.finalStationName || b.name,
      'ko',
    );
    if (nameCmp !== 0) return nameCmp;
    return a.id.localeCompare(b.id);
  })[0];
}

function toInfoRowFromEquipment(marker: EquipmentMarker): InfoRow {
  return {
    marker_id: marker.id,
    group_role: storedGroupRoleOf(marker),
    facility_year: marker.facilityYear,
    project_code: marker.projectCode,
    facility_code: marker.facilityCode,
    business_type: marker.businessType,
    final_station_name: marker.finalStationName || marker.name,
    eq_type: marker.eqType,
    install_date: marker.installDate,
    open_date: marker.openDate,
  };
}

function markerDisplayNames(marker: EquipmentMarker): Set<string> {
  return new Set(
    [marker.finalStationName, marker.name]
      .map((value) => (value ?? '').trim())
      .filter(Boolean),
  );
}

function resolveGroupRole(marker: EquipmentMarker, row?: InfoRow): string {
  const fromRow = normalizeGroupRole(row?.group_role);
  if (fromRow) return fromRow;
  return storedGroupRoleOf(marker);
}

/**
 * 동일 번지 국소 1개에 대응할 information 행을 pool에서 꺼낸다.
 * facility_code 단독 매칭은 쓰지 않는다(코드 중복 시 다른 국소가 1행으로 흡수되는 문제).
 */
function takeInfoRowForMarker(
  marker: EquipmentMarker,
  pool: InfoRow[],
): InfoRow | null {
  const names = markerDisplayNames(marker);

  const takeAt = (index: number): InfoRow => {
    const [row] = pool.splice(index, 1);
    return row;
  };

  const byIdAndName = pool.findIndex(
    (row) =>
      row.marker_id === marker.id &&
      names.has((row.final_station_name ?? '').trim()),
  );
  if (byIdAndName >= 0) return takeAt(byIdAndName);

  const idOnlyIndexes = pool
    .map((row, index) => (row.marker_id === marker.id ? index : -1))
    .filter((index) => index >= 0);
  if (idOnlyIndexes.length === 1) return takeAt(idOnlyIndexes[0]);

  const byName = pool.findIndex((row) =>
    names.has((row.final_station_name ?? '').trim()),
  );
  if (byName >= 0) return takeAt(byName);

  if (idOnlyIndexes.length > 0) return takeAt(idOnlyIndexes[0]);

  return null;
}

/**
 * 동일 번지 국소 목록(대표+SUB)을 기준으로 상세 표 행을 만든다.
 * 그룹이면 국소마다 1행. 단독(1국소)이면 information 다건을 그대로 노출.
 */
function buildEquipmentDetailRows(
  relatedMarkers: EquipmentMarker[],
  detailedInfo: InfoRow[],
): InfoRow[] {
  if (relatedMarkers.length === 0) return [];

  if (relatedMarkers.length === 1) {
    const marker = relatedMarkers[0];
    if (detailedInfo.length > 0) {
      return detailedInfo.map((row) => ({
        ...row,
        group_role: resolveGroupRole(marker, row),
        marker_id: row.marker_id || marker.id,
      }));
    }
    return [toInfoRowFromEquipment(marker)];
  }

  const pool = [...detailedInfo];
  const rows: InfoRow[] = relatedMarkers.map((marker) => {
    const fromDb = takeInfoRowForMarker(marker, pool);
    const base = fromDb ?? toInfoRowFromEquipment(marker);
    return {
      ...base,
      group_role: resolveGroupRole(marker, fromDb ?? undefined),
      marker_id: base.marker_id || marker.id,
    };
  });

  // 그룹 모드: 국소 1건=1행만. 잔여 information을 붙이면 다른 동/국소가 섞인다.
  return rows;
}

export function MarkerDetailModal() {
  const isDetailOpen = useMapMarkerStore((state) => state.isDetailOpen);
  const selectedMarkerId = useMapMarkerStore((state) => state.selectedMarkerId);
  const closeAllModals = useMapMarkerStore((state) => state.closeAllModals);
  const mode = useMapMarkerStore((state) => state.mode);
  
  const { markers } = useActiveMarkers();
  const marker = markers.find((m) => m.id === selectedMarkerId);
  const { toast } = useToast();

  // 현재 모드에 맞춰 좁힌 타입 뷰 (as any 제거용)
  const equipmentMarker =
    mode === 'equipment' ? (marker as EquipmentMarker | undefined) : undefined;
  const batteryMarker =
    mode === 'battery' ? (marker as BatteryMarker | undefined) : undefined;

  const [detailedInfo, setDetailedInfo] = useState<InfoRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // GPSMAP 좌표·주소 변환 + 건축물대장 (버튼으로 각각 따로 열어 조회)
  const [gpsInfo, setGpsInfo] = useState<GpsLookupResult | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  // 좌표·주소 변환 + 건축물대장을 하나로 묶은 펼침 여부
  const [openGps, setOpenGps] = useState(false);
  // 동일 번지 국소 개별 배치 섹션 펼침 여부
  const [openSubList, setOpenSubList] = useState(false);
  // 같은 좌표 재열람 시 재호출을 막는 좌표별 캐시
  const gpsCacheRef = useRef<Map<string, GpsLookupResult>>(new Map());

  // 셀 드래그 선택 상태
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const dragStart = useRef<{ r: number; c: number } | null>(null);
  const isDragging = useRef(false);

  const supabase = getSupabaseBrowserClient();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthSession();
  // 개별 표시(해제) 토글 진행 중인 마커 id
  const [detachingId, setDetachingId] = useState<string | null>(null);
  // "모두 합치기" 진행 중 여부
  const [merging, setMerging] = useState(false);
  // 동 단위 일괄 개별 표시/숨기기 진행 중인 동 라벨
  const [detachingGroup, setDetachingGroup] = useState<string | null>(null);
  // 구분(대표/단독/SUB) 변경 중인 마커 id
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
  // 번지에서 분리 진행 중인 라벨(동/지하/기타)
  const [separatingLabel, setSeparatingLabel] = useState<string | null>(null);
  // 대표 선택 UI가 열린 라벨(분리 실행 전 대표 고르기)
  const [pickingSplitLabel, setPickingSplitLabel] = useState<string | null>(
    null,
  );
  // 분리 그룹 → 번지로 합치기(원복) 진행 중 여부
  const [mergingSplit, setMergingSplit] = useState(false);

  /**
   * 같은 번지 SUB의 지도 개별 표시 여부를 저장한다.
   * 켤 때: 같은 동(棟)에서는 이 국소만 대표 핀으로 두고 형제 SUB 핀은 끈다.
   */
  const setMarkerDetached = async (markerId: string, detached: boolean) => {
    if (!supabase) return;
    if (!isAuthenticated) {
      toast({ variant: 'destructive', description: '로그인이 필요합니다.' });
      return;
    }
    setDetachingId(markerId);
    try {
      if (detached) {
        const target = (markers as EquipmentMarker[]).find(
          (item) => item.id === markerId,
        );
        const dongLabel = target ? getMarkerDongLabel(target) : null;
        const sameDongIds = relatedEquipmentMarkers
          .filter(
            (item) =>
              item.parentMarkerId &&
              (!dongLabel || getMarkerDongLabel(item) === dongLabel),
          )
          .map((item) => item.id);

        const hideIds = sameDongIds.filter((id) => id !== markerId);
        if (hideIds.length > 0) {
          const { error: hideError } = await supabase
            .from('markers')
            .update({ detached_visible: false })
            .in('id', hideIds);
          if (hideError) throw hideError;
        }

        const { error } = await supabase
          .from('markers')
          .update({ detached_visible: true })
          .eq('id', markerId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('markers')
          .update({ detached_visible: false })
          .eq('id', markerId);
        if (error) throw error;
      }

      await queryClient.invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY });
      toast({
        description: detached
          ? '동 대표로 지도에 표시했습니다. 핀을 실제 위치로 드래그해 주세요.'
          : '개별 표시를 해제했습니다.',
      });
      if (detached) closeAllModals();
    } catch (err) {
      console.error('개별 표시 저장 실패:', err);
      toast({
        variant: 'destructive',
        description: dbErrorMessage(err, '개별 표시 변경에 실패했습니다.'),
      });
    } finally {
      setDetachingId(null);
    }
  };

  /** 현재 개별 표시된 동일 번지 SUB를 모두 다시 숨겨 대표 1개로 합친다. */
  const mergeAllDetachedSubs = async () => {
    if (!supabase) return;
    if (!isAuthenticated) {
      toast({ variant: 'destructive', description: '로그인이 필요합니다.' });
      return;
    }
    const ids = relatedEquipmentMarkers
      .filter((sub) => sub.parentMarkerId && sub.detachedVisible)
      .map((sub) => sub.id);
    if (!ids.length) return;

    setMerging(true);
    try {
      const { error } = await supabase
        .from('markers')
        .update({ detached_visible: false })
        .in('id', ids);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY });
      toast({ description: `${ids.length}개 국소를 대표로 합쳤습니다.` });
    } catch (err) {
      console.error('모두 합치기 실패:', err);
      toast({
        variant: 'destructive',
        description: dbErrorMessage(err, '합치기에 실패했습니다.'),
      });
    } finally {
      setMerging(false);
    }
  };

  /**
   * 동(棟) 단위로 지도 표시를 토글한다.
   * 켤 때: 동 대표 1국소만 표시(나머지 SUB 핀 숨김). 끌 때: 동 전체 숨김.
   */
  const setGroupDetached = async (
    dongLabel: string,
    subs: EquipmentMarker[],
    detached: boolean,
  ) => {
    const ids = subs.map((sub) => sub.id);
    if (!supabase || ids.length === 0) return;
    if (!isAuthenticated) {
      toast({ variant: 'destructive', description: '로그인이 필요합니다.' });
      return;
    }
    setDetachingGroup(dongLabel);
    try {
      if (detached) {
        const rep = pickDongMapRepresentative(subs);
        if (!rep) return;
        const hideIds = ids.filter((id) => id !== rep.id);
        if (hideIds.length > 0) {
          const { error: hideError } = await supabase
            .from('markers')
            .update({ detached_visible: false })
            .in('id', hideIds);
          if (hideError) throw hideError;
        }
        const { error } = await supabase
          .from('markers')
          .update({ detached_visible: true })
          .eq('id', rep.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('markers')
          .update({ detached_visible: false })
          .in('id', ids);
        if (error) throw error;
      }
      await queryClient.invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY });
      toast({
        description: detached
          ? `${dongLabel} 대표 1국소를 지도에 표시했습니다. 핀을 실제 위치로 드래그해 주세요.`
          : `${dongLabel} 개별 표시를 해제했습니다.`,
      });
    } catch (err) {
      console.error('동 단위 개별 표시 변경 실패:', err);
      toast({
        variant: 'destructive',
        description: dbErrorMessage(err, '개별 표시 변경에 실패했습니다.'),
      });
    } finally {
      setDetachingGroup(null);
    }
  };

  /**
   * 국소 구분(대표/단독/SUB)을 DB에 저장한다.
   * - 대표: 동일 번지에서 이 국소를 대표로, 나머지(단독 제외)는 SUB
   * - 단독: 그룹에서 이탈. 대상이 대표였으면 남은 국소 중 새 대표(1명이면 단독) 승격
   * - SUB: 현재 대표(없으면 다른 국소 승격) 아래로 연결
   */
  const changeMarkerGroupRole = async (
    markerId: string,
    nextRole: GroupRole,
  ) => {
    if (!supabase) return;
    if (!isAuthenticated) {
      toast({ variant: 'destructive', description: '로그인이 필요합니다.' });
      return;
    }

    const allEquipment = markers as EquipmentMarker[];
    const target = allEquipment.find((item) => item.id === markerId);
    if (!target) return;
    if (storedGroupRoleOf(target) === nextRole) return;

    setChangingRoleId(markerId);
    try {
      const mates = getAddressGroupMates(target, allEquipment);

      if (nextRole === GROUP_ROLE_STANDALONE) {
        const wasRep =
          storedGroupRoleOf(target) === GROUP_ROLE_REPRESENTATIVE ||
          (!target.parentMarkerId &&
            storedGroupRoleOf(target) !== GROUP_ROLE_STANDALONE);

        const { error } = await supabase
          .from('markers')
          .update({
            parent_marker_id: null,
            group_role: GROUP_ROLE_STANDALONE,
          })
          .eq('id', markerId);
        if (error) throw error;

        if (wasRep) {
          const remaining = mates.filter(
            (item) =>
              item.id !== markerId &&
              storedGroupRoleOf(item) !== GROUP_ROLE_STANDALONE,
          );

          if (remaining.length === 0) {
            toast({
              description: '단독으로 변경했습니다. 그룹에서 분리됩니다.',
            });
          } else if (remaining.length === 1) {
            const { error: soloError } = await supabase
              .from('markers')
              .update({
                parent_marker_id: null,
                group_role: GROUP_ROLE_STANDALONE,
              })
              .eq('id', remaining[0].id);
            if (soloError) throw soloError;
            toast({
              description:
                '단독으로 분리했습니다. 남은 1국소도 단독으로 변경했습니다.',
            });
          } else {
            const newRep = pickNextAddressRepresentative(remaining);
            if (!newRep) {
              toast({
                description: '단독으로 변경했습니다. 그룹에서 분리됩니다.',
              });
            } else {
              const { error: promoteError } = await supabase
                .from('markers')
                .update({
                  parent_marker_id: null,
                  group_role: GROUP_ROLE_REPRESENTATIVE,
                })
                .eq('id', newRep.id);
              if (promoteError) throw promoteError;

              const subIds = remaining
                .filter((item) => item.id !== newRep.id)
                .map((item) => item.id);
              if (subIds.length > 0) {
                const { error: subError } = await supabase
                  .from('markers')
                  .update({
                    parent_marker_id: newRep.id,
                    group_role: GROUP_ROLE_SUB,
                  })
                  .in('id', subIds);
                if (subError) throw subError;
              }
              toast({
                description: `단독으로 분리했습니다. '${newRep.finalStationName || newRep.name}'을(를) 새 대표로 지정했습니다.`,
              });
            }
          }
        } else {
          toast({
            description: '단독으로 변경했습니다. 그룹에서 분리됩니다.',
          });
        }
      } else if (nextRole === GROUP_ROLE_REPRESENTATIVE) {
        const { error: repError } = await supabase
          .from('markers')
          .update({
            parent_marker_id: null,
            group_role: GROUP_ROLE_REPRESENTATIVE,
          })
          .eq('id', markerId);
        if (repError) throw repError;

        const subIds = mates
          .filter(
            (item) =>
              item.id !== markerId &&
              storedGroupRoleOf(item) !== GROUP_ROLE_STANDALONE,
          )
          .map((item) => item.id);
        if (subIds.length > 0) {
          const { error: subError } = await supabase
            .from('markers')
            .update({
              parent_marker_id: markerId,
              group_role: GROUP_ROLE_SUB,
            })
            .in('id', subIds);
          if (subError) throw subError;
        }
        toast({
          description: `대표로 변경했습니다.${subIds.length > 0 ? ` (SUB ${subIds.length}건)` : ''}`,
        });
      } else {
        // SUB
        const candidates = mates.filter(
          (item) =>
            item.id !== markerId &&
            storedGroupRoleOf(item) !== GROUP_ROLE_STANDALONE,
        );
        const rep =
          candidates.find(
            (item) => storedGroupRoleOf(item) === GROUP_ROLE_REPRESENTATIVE,
          ) ??
          candidates.find((item) => !item.parentMarkerId) ??
          candidates[0];

        if (!rep) {
          const { error } = await supabase
            .from('markers')
            .update({
              parent_marker_id: null,
              group_role: GROUP_ROLE_STANDALONE,
            })
            .eq('id', markerId);
          if (error) throw error;
          toast({
            description:
              '같은 번지에 연결할 대표가 없어 단독으로 설정했습니다.',
          });
        } else {
          const wasRep =
            storedGroupRoleOf(target) === GROUP_ROLE_REPRESENTATIVE ||
            !target.parentMarkerId;

          if (wasRep) {
            const { error: promoteError } = await supabase
              .from('markers')
              .update({
                parent_marker_id: null,
                group_role: GROUP_ROLE_REPRESENTATIVE,
              })
              .eq('id', rep.id);
            if (promoteError) throw promoteError;

            const reassignIds = mates
              .filter(
                (item) =>
                  item.id !== markerId &&
                  item.id !== rep.id &&
                  storedGroupRoleOf(item) !== GROUP_ROLE_STANDALONE,
              )
              .map((item) => item.id);
            if (reassignIds.length > 0) {
              const { error: reassignError } = await supabase
                .from('markers')
                .update({
                  parent_marker_id: rep.id,
                  group_role: GROUP_ROLE_SUB,
                })
                .in('id', reassignIds);
              if (reassignError) throw reassignError;
            }
          }

          const { error } = await supabase
            .from('markers')
            .update({
              parent_marker_id: rep.id,
              group_role: GROUP_ROLE_SUB,
            })
            .eq('id', markerId);
          if (error) throw error;
          toast({ description: 'SUB로 변경했습니다.' });
        }
      }

      await queryClient.invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY });
    } catch (err) {
      console.error('구분 변경 실패:', err);
      toast({
        variant: 'destructive',
        description: dbErrorMessage(err, '구분 변경에 실패했습니다.'),
      });
    } finally {
      setChangingRoleId(null);
    }
  };

  /**
   * 그룹 멤버에 group_key·대표·SUB를 일괄 지정한다.
   * 대표 1개(기존 대표 우선, 없으면 최초 등록) → parent=null, 나머지 SUB, 1개면 단독.
   * 반환: 지정된 대표.
   */
  const assignGroupMembers = async (
    members: EquipmentMarker[],
    groupKeyValue: string | null,
    preferredRepId?: string,
  ): Promise<EquipmentMarker | null> => {
    if (!supabase || members.length === 0) return null;
    const ordered = [...members].sort((a, b) => {
      const at = a.createdAt || '';
      const bt = b.createdAt || '';
      if (at !== bt) return at.localeCompare(bt);
      return a.id.localeCompare(b.id);
    });
    // 대표: 직접 지정(preferredRepId) 우선 → 기존 대표 → 최초 등록
    const rep =
      (preferredRepId
        ? ordered.find((m) => m.id === preferredRepId)
        : undefined) ??
      ordered.find(
        (m) => storedGroupRoleOf(m) === GROUP_ROLE_REPRESENTATIVE,
      ) ??
      ordered[0];
    const isSolo = ordered.length === 1;

    const { error: repError } = await supabase
      .from('markers')
      .update({
        group_key: groupKeyValue,
        parent_marker_id: null,
        group_role: isSolo ? GROUP_ROLE_STANDALONE : GROUP_ROLE_REPRESENTATIVE,
        detached_visible: false,
      })
      .eq('id', rep.id);
    if (repError) throw repError;

    const subIds = ordered.filter((m) => m.id !== rep.id).map((m) => m.id);
    if (subIds.length > 0) {
      const { error: subError } = await supabase
        .from('markers')
        .update({
          group_key: groupKeyValue,
          parent_marker_id: rep.id,
          group_role: GROUP_ROLE_SUB,
          detached_visible: false,
        })
        .in('id', subIds);
      if (subError) throw subError;
    }
    return rep;
  };

  /**
   * 라벨(동/지하/기타) 국소들을 번지 그룹에서 빼내 독립 그룹(대표+SUB)으로 분리한다.
   * - 분리 그룹: 새 group_key 부여 후 대표+SUB(1개면 단독).
   * - 남은 번지 그룹: 대표가 빠졌으면 최초 국소를 새 대표로 승격(1개면 단독).
   */
  const separateLabelGroup = async (label: string, repId?: string) => {
    if (!supabase) return;
    if (!isAuthenticated) {
      toast({ variant: 'destructive', description: '로그인이 필요합니다.' });
      return;
    }
    const targets = relatedEquipmentMarkers.filter(
      (m) => getMarkerDongLabel(m) === label,
    );
    if (targets.length === 0) return;
    const remaining = relatedEquipmentMarkers.filter(
      (m) => getMarkerDongLabel(m) !== label,
    );

    setSeparatingLabel(label);
    try {
      const lotKey =
        getLotAddressKey(
          targets[0].roadAddress || targets[0].jibunAddress || '',
        ) || 'lot';
      const newKey = buildSplitGroupKey(lotKey, label, targets[0].id);
      await assignGroupMembers(targets, newKey, repId);
      if (remaining.length > 0) {
        await assignGroupMembers(remaining, null);
      }
      setPickingSplitLabel(null);
      await queryClient.invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY });
      const repMarker = repId
        ? targets.find((m) => m.id === repId)
        : undefined;
      toast({
        description: `'${label}' ${targets.length}개 국소를 분리했습니다.${
          repMarker
            ? ` 대표: '${repMarker.finalStationName || repMarker.name}'.`
            : ''
        } 지도에서 새 대표 핀을 실제 위치로 드래그해 주세요.`,
      });
    } catch (err) {
      console.error('분리 실패:', err);
      toast({
        variant: 'destructive',
        description: dbErrorMessage(err, '분리에 실패했습니다.'),
      });
    } finally {
      setSeparatingLabel(null);
    }
  };

  /**
   * 현재 보고 있는 분리 그룹(group_key)을 번지 그룹으로 되돌린다(원복).
   * group_key 를 지우고, 번지 전체(기존 번지 멤버 + 되돌린 멤버)를 재정렬한다.
   */
  const mergeSplitGroupToLot = async () => {
    if (!supabase) return;
    if (!isAuthenticated) {
      toast({ variant: 'destructive', description: '로그인이 필요합니다.' });
      return;
    }
    const splitMembers = relatedEquipmentMarkers.filter((m) =>
      (m.groupKey ?? '').trim(),
    );
    if (splitMembers.length === 0) return;

    const lotKey = getLotAddressKey(
      splitMembers[0].roadAddress || splitMembers[0].jibunAddress || '',
    );
    const revertIds = new Set(splitMembers.map((m) => m.id));

    setMergingSplit(true);
    try {
      const { error } = await supabase
        .from('markers')
        .update({ group_key: null })
        .in('id', [...revertIds]);
      if (error) throw error;

      // 번지 그룹 전체 = 되돌린 멤버 + 기존 번지 멤버(다른 분리 그룹은 제외).
      const allEquipment = markers as EquipmentMarker[];
      const lotMembers = allEquipment.filter((m) => {
        if (revertIds.has(m.id)) return true;
        if ((m.groupKey ?? '').trim()) return false;
        return (
          lotKey !== '' &&
          getLotAddressKey(m.roadAddress || m.jibunAddress || '') === lotKey
        );
      });
      await assignGroupMembers(lotMembers, null);

      await queryClient.invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY });
      toast({ description: '분리를 해제하고 번지 그룹으로 합쳤습니다.' });
    } catch (err) {
      console.error('번지로 합치기 실패:', err);
      toast({
        variant: 'destructive',
        description: dbErrorMessage(err, '번지로 합치기에 실패했습니다.'),
      });
    } finally {
      setMergingSplit(false);
    }
  };

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

    return [...byId.values()].sort((a, b) => {
      const roleA = storedGroupRoleOf(a);
      const roleB = storedGroupRoleOf(b);
      if (
        roleA === GROUP_ROLE_REPRESENTATIVE &&
        roleB !== GROUP_ROLE_REPRESENTATIVE
      ) {
        return -1;
      }
      if (
        roleB === GROUP_ROLE_REPRESENTATIVE &&
        roleA !== GROUP_ROLE_REPRESENTATIVE
      ) {
        return 1;
      }
      const dongCmp = getMarkerDongLabel(a).localeCompare(
        getMarkerDongLabel(b),
        'ko',
      );
      if (dongCmp !== 0) return dongCmp;
      return (a.finalStationName || a.name).localeCompare(
        b.finalStationName || b.name,
        'ko',
      );
    });
  }, [mode, equipmentMarker, markers]);

  /** 연관 상세 표 = 동일 번지 전체(동 개별 표시와 무관). */
  const detailEquipmentMarkers = relatedEquipmentMarkers;

  const equipmentRows = useMemo(
    () => buildEquipmentDetailRows(detailEquipmentMarkers, detailedInfo),
    [detailEquipmentMarkers, detailedInfo],
  );

  useEffect(() => {
    if (!isDetailOpen || !marker || mode !== 'equipment' || !supabase) {
      setDetailedInfo([]);
      return;
    }

    const fetchDetail = async () => {
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

        // 행 조립(국소 1건=1행)은 buildEquipmentDetailRows 가 담당.
        // 여기서 facility_code/마커 합성으로 미리 채우면 중복·누락이 생긴다.
        setDetailedInfo(infoRows);
      } catch (err) {
        console.error('연관 상세 정보 조회 실패:', err);
        setDetailedInfo([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetail();
    setSelectedCells(new Set());
  }, [
    isDetailOpen,
    selectedMarkerId,
    mode,
    marker,
    supabase,
    relatedEquipmentMarkers,
  ]);

  // 마커/모달이 바뀌면 섹션을 접고 상태를 초기화(펼치기로 다시 연다). 좌표 캐시는 유지.
  useEffect(() => {
    setOpenGps(false);
    setOpenSubList(false);
    setPickingSplitLabel(null);
    setGpsInfo(null);
    setGpsError(null);
    setGpsLoading(false);
  }, [isDetailOpen, selectedMarkerId]);

  // 버튼 클릭 시에만 좌표로 GPSMAP(역주소·PNU·필지·건축물대장) 조회. 같은 좌표는 캐시로 재호출 생략.
  const loadGpsInfo = async () => {
    if (!marker) return;
    const { lat, lng } = marker;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setGpsInfo(null);
      setGpsError('좌표 정보가 없어 조회할 수 없습니다.');
      return;
    }
    const key = `${lat},${lng}`;
    const cached = gpsCacheRef.current.get(key);
    if (cached) {
      setGpsInfo(cached);
      setGpsError(null);
      setGpsLoading(false);
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    setGpsInfo(null);
    try {
      const info = await runSingleLookup(`${lat}, ${lng}`);
      gpsCacheRef.current.set(key, info);
      setGpsInfo(info);
    } catch {
      setGpsInfo(null);
      setGpsError('좌표·주소 변환 정보를 불러오지 못했습니다.');
    } finally {
      setGpsLoading(false);
    }
  };

  // 펼치기/숨기기 토글: 펼칠 때 아직 조회 전이면 조회를 시작한다.
  const toggleGps = () => {
    const willOpen = !openGps;
    setOpenGps(willOpen);
    if (willOpen && !gpsInfo && !gpsLoading) {
      void loadGpsInfo();
    }
  };

  // 클립보드 복사 헬퍼
  const writeTsvToClipboard = async (tsvText: string, message: string) => {
    try {
      await navigator.clipboard.writeText(tsvText);
      toast({ description: message });
    } catch (err) {
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
    let headers: string[] = [];
    let rowsData: string[][] = [];

    if (mode === 'equipment') {
      headers = [
        '구분',
        '시설연도',
        '프로젝트코드',
        '통합시설코드',
        '사업구분',
        '국소명-최종',
        '장비타입',
        '시설일',
        '개통일',
      ];

      rowsData = equipmentRows.map((row) => [
        resolveRowGroupRole(row),
        row.facility_year || '',
        row.project_code || '',
        row.facility_code || '',
        row.business_type || '',
        row.final_station_name || '',
        row.eq_type || '',
        row.install_date ? row.install_date.split('T')[0] : '',
        row.open_date ? row.open_date.split('T')[0] : '',
      ]);
    } else {
      headers = ['ERP명', '주소', '용량(AH)', '수량(Cell)', '창고/국소/국사명', '등록일'];
      const items = batteryMarker?.items || [];
      rowsData = items.map((item: BatterySpecItem) => [
        item.erpName || '',
        item.address || '',
        String(item.capacity || 0),
        String(item.quantity || 0),
        item.stationName || '',
        item.createdAt ? item.createdAt.split('T')[0] : '',
      ]);
    }

    const tsvContent = [
      headers.join('\t'),
      ...rowsData.map(row => row.join('\t'))
    ].join('\n');

    writeTsvToClipboard(tsvContent, '표 전체 내용이 클립보드에 복사되었습니다.');
  };

  // 선택 셀 복사
  const handleCopySelected = () => {
    if (selectedCells.size === 0) return;

    // 셀 좌표 정렬 및 추출
    const coords = Array.from(selectedCells).map((key) => {
      const [r, c] = key.split(',').map(Number);
      return { r, c };
    });

    const minRow = Math.min(...coords.map((o) => o.r));
    const maxRow = Math.max(...coords.map((o) => o.r));
    const minCol = Math.min(...coords.map((o) => o.c));
    const maxCol = Math.max(...coords.map((o) => o.c));

    const grid: string[][] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const rowArr: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const hasCell = coords.some((o) => o.r === r && o.c === c);
        if (hasCell) {
          rowArr.push(getCellValue(r, c));
        } else {
          rowArr.push('');
        }
      }
      grid.push(rowArr);
    }

    const tsvContent = grid.map((row) => row.join('\t')).join('\n');
    writeTsvToClipboard(tsvContent, '선택한 셀 내용이 클립보드에 복사되었습니다.');
  };

  const getCellValue = (r: number, c: number): string => {
    if (mode === 'equipment') {
      const row = equipmentRows[r];
      if (!row) return '';
      switch (c) {
        case 0: return resolveRowGroupRole(row);
        case 1: return row.facility_year || '';
        case 2: return row.project_code || '';
        case 3: return row.facility_code || '';
        case 4: return row.business_type || '';
        case 5: return row.final_station_name || '';
        case 6: return row.eq_type || '';
        case 7: return row.install_date ? row.install_date.split('T')[0] : '';
        case 8: return row.open_date ? row.open_date.split('T')[0] : '';
        default: return '';
      }
    } else {
      const items = batteryMarker?.items || [];
      const item = items[r];
      if (!item) return '';
      switch (c) {
        case 0: return item.erpName || '';
        case 1: return item.address || '';
        case 2: return String(item.capacity || 0);
        case 3: return String(item.quantity || 0);
        case 4: return item.stationName || '';
        case 5: return item.createdAt ? item.createdAt.split('T')[0] : '';
        default: return '';
      }
    }
  };

  // 마우스 드래그 선택 이벤트 핸들러
  const handleMouseDown = (r: number, c: number) => {
    isDragging.current = true;
    dragStart.current = { r, c };
    setSelectedCells(new Set([`${r},${c}`]));
  };

  const handleMouseOver = (r: number, c: number) => {
    if (!isDragging.current || !dragStart.current) return;
    const start = dragStart.current;

    const minRow = Math.min(start.r, r);
    const maxRow = Math.max(start.r, r);
    const minCol = Math.min(start.c, c);
    const maxCol = Math.max(start.c, c);

    const nextSet = new Set<string>();
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        nextSet.add(`${row},${col}`);
      }
    }
    setSelectedCells(nextSet);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    dragStart.current = null;
  };

  useEffect(() => {
    const globalMouseUp = () => {
      isDragging.current = false;
      dragStart.current = null;
    };
    window.addEventListener('mouseup', globalMouseUp);
    return () => window.removeEventListener('mouseup', globalMouseUp);
  }, []);

  // SUB 국소를 동(棟)별로 묶는다. 동당 지도 핀은 최대 1개.
  const dongGroups = useMemo(() => {
    const byDong = new Map<string, EquipmentMarker[]>();
    for (const sub of relatedEquipmentMarkers) {
      if (!sub.parentMarkerId) continue;
      const label = getMarkerDongLabel(sub);
      const list = byDong.get(label) ?? [];
      list.push(sub);
      byDong.set(label, list);
    }
    return Array.from(byDong.entries())
      .sort(([a], [b]) => dongSortKey(a) - dongSortKey(b))
      .map(([label, subs]) => {
        const isDongShown = subs.some((s) => s.detachedVisible);
        const mapRep = pickDongMapRepresentative(subs);
        return { label, subs, isDongShown, mapRepId: mapRep?.id ?? null };
      });
  }, [relatedEquipmentMarkers]);

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
  // 현재 지도에 개별 표시된(합칠 수 있는) SUB 수
  const detachedSubCount = relatedEquipmentMarkers.filter(
    (sub) => sub.parentMarkerId && sub.detachedVisible,
  ).length;

  // 현재 보고 있는 그룹이 번지에서 분리된(group_key 있는) 그룹인지.
  const relatedIsSplit = relatedEquipmentMarkers.some((m) =>
    (m.groupKey ?? '').trim(),
  );
  // 번지 그룹 안의 분리 라벨(동/지하/기타)별 개수. 2개 이상이면 분리 의미가 있음.
  const separationLabelCounts = (() => {
    const counts = new Map<string, number>();
    for (const m of relatedEquipmentMarkers) {
      const label = getMarkerDongLabel(m);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort(
      ([a], [b]) => dongSortKey(a) - dongSortKey(b),
    );
  })();
  const canSplit = !relatedIsSplit && separationLabelCounts.length >= 2;

  return (
    <Dialog open={isDetailOpen} onOpenChange={(open) => !open && closeAllModals()}>
      <DialogContent className="flex max-h-[90vh] w-max max-w-[98vw] flex-col gap-0 overflow-hidden bg-slate-900 border-slate-800 p-0 text-slate-100 shadow-2xl rounded-2xl">
        <div className="shrink-0 border-b border-slate-800 px-6 pb-4 pt-6 pr-12">
          <DialogHeader className="flex flex-row items-center gap-3 space-y-0 text-left">
            <div className="h-4 w-4 rounded-full" style={{ backgroundColor: color }} />
            <DialogTitle className="text-lg font-bold text-slate-100">
              마커 상세 정보
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 [scrollbar-gutter:stable]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* 기본 정보 */}
            <div className="space-y-3 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">기본 정보</h4>
              <div>
                <label className="text-[10px] font-medium text-slate-500">장소 이름</label>
                <div className="mt-0.5 text-sm font-semibold text-slate-200">{marker.name}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500">위도</label>
                  <div className="mt-0.5 font-mono text-xs">{marker.lat}</div>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500">경도</label>
                  <div className="mt-0.5 font-mono text-xs">{marker.lng}</div>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-500">메모</label>
                <div className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                  {marker.memo || '입력된 메모가 없습니다.'}
                </div>
              </div>
            </div>

            {/* 주소 및 부가정보 */}
            <div className="space-y-3 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">위치 정보</h4>
              <div>
                <label className="text-[10px] font-medium text-slate-500">주소 (지번)</label>
                <div className="mt-0.5 text-xs text-slate-200">
                  {mode === 'equipment'
                    ? equipmentMarker?.jibunAddress || '주소 정보 없음'
                    : batteryMarker?.address || '주소 정보 없음'}
                </div>
              </div>
              {mode === 'equipment' && equipmentMarker?.roadAddress ? (
                <div>
                  <label className="text-[10px] font-medium text-slate-500">도로명 주소</label>
                  <div className="mt-0.5 text-xs text-slate-300">{equipmentMarker.roadAddress}</div>
                </div>
              ) : null}
              <div>
                <label className="text-[10px] font-medium text-slate-500">태그</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {marker.tags && marker.tags.length > 0 ? (
                    marker.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="rounded-full border border-slate-700/55 bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300"
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

          {/* GPSMAP 좌표·주소 변환 + 건축물대장 — 하나의 펼치기·숨기기 */}
          {mode === 'equipment' ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
              <button
                type="button"
                onClick={toggleGps}
                className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-900/40"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                  <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                  좌표·주소 변환 · 건축물대장
                </span>
                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                  {gpsLoading && openGps ? '조회 중…' : openGps ? '숨기기' : '펼치기'}
                  {openGps ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </span>
              </button>
              {openGps ? (
                <div className="grid grid-cols-1 gap-4 border-t border-slate-800/80 px-4 pb-4 pt-3 md:grid-cols-2">
                  {/* 좌표·주소 변환 */}
                  <div className="space-y-2">
                    <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <MapPin className="h-3 w-3 text-emerald-400" />
                      좌표·주소 변환
                    </h4>
                    {gpsError ? (
                      <p className="text-[11px] text-slate-500">{gpsError}</p>
                    ) : (
                      <table className="w-full text-[11px]">
                        <tbody>
                          <GpsInfoRow label="구 주소" value={gpsInfo?.oldAddress} loading={gpsLoading} />
                          <GpsInfoRow label="신 주소" value={gpsInfo?.roadAddress} loading={gpsLoading} />
                          <GpsInfoRow label="우편번호" value={gpsInfo?.zipcode} loading={gpsLoading} />
                          <GpsInfoRow
                            label="좌표"
                            value={
                              gpsInfo
                                ? `${gpsInfo.center.lat.toFixed(6)}, ${gpsInfo.center.lng.toFixed(6)}`
                                : undefined
                            }
                            loading={gpsLoading}
                          />
                          <GpsInfoRow label="위도(도분초)" value={gpsInfo?.latDms} loading={gpsLoading} />
                          <GpsInfoRow label="경도(도분초)" value={gpsInfo?.lngDms} loading={gpsLoading} />
                          <GpsInfoRow label="구글좌표" value={gpsInfo?.googleCoord} loading={gpsLoading} />
                          <GpsInfoRow label="PNU" value={gpsInfo?.pnu} loading={gpsLoading} />
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* 건축물대장 */}
                  <div className="space-y-2">
                    <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <Building2 className="h-3 w-3 text-emerald-400" />
                      건축물대장
                    </h4>
                    {gpsError ? (
                      <p className="text-[11px] text-slate-500">{gpsError}</p>
                    ) : gpsLoading ? (
                      <p className="text-[11px] text-slate-500">조회 중…</p>
                    ) : gpsInfo?.building ? (
                      <table className="w-full text-[11px]">
                        <tbody>
                          <GpsInfoRow label="건물명칭" value={gpsInfo.building.name} loading={false} />
                          <GpsInfoRow label="동명칭" value={gpsInfo.building.dongName} loading={false} />
                          <GpsInfoRow label="지상층수" value={gpsInfo.building.groundFloors} loading={false} />
                          <GpsInfoRow label="지하층수" value={gpsInfo.building.basementFloors} loading={false} />
                          <GpsInfoRow label="연면적" value={gpsInfo.building.totalArea} loading={false} />
                          <GpsInfoRow label="대지면적" value={gpsInfo.building.platArea} loading={false} />
                          <GpsInfoRow label="건축면적" value={gpsInfo.building.buildingArea} loading={false} />
                          <GpsInfoRow label="주용도" value={gpsInfo.building.mainUse} loading={false} />
                          <GpsInfoRow label="세부용도" value={gpsInfo.building.detailUse} loading={false} />
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-[11px] text-slate-500">건축물대장 조회 결과가 없습니다.</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* 같은 번지 국소 개별 배치 (드래그로 실위치 지정) */}
          {mode === 'equipment' && equipmentMarker ? (
            equipmentMarker.parentMarkerId ? (
              // 이 마커 자체가 개별 표시된 SUB
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4">
                <div className="min-w-0 text-xs text-slate-300">
                  이 국소는 동의{' '}
                  <span className="font-semibold text-emerald-300">대표</span>로
                  개별 표시 중입니다. 지도에서 핀을 드래그해 실제 위치로 옮길 수
                  있습니다. 같은 동 SUB는 지도에 표시되지 않습니다.
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {relatedIsSplit ? (
                    <button
                      onClick={mergeSplitGroupToLot}
                      disabled={mergingSplit}
                      title="이 분리 그룹을 원래 번지 그룹으로 되돌립니다"
                      className="rounded-lg border border-amber-600/50 bg-amber-600/20 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 transition-colors hover:bg-amber-600/30 disabled:opacity-50"
                    >
                      {mergingSplit ? '합치는 중…' : '번지로 합치기'}
                    </button>
                  ) : null}
                  <button
                    onClick={() => setMarkerDetached(equipmentMarker.id, false)}
                    disabled={detachingId === equipmentMarker.id}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
                  >
                    개별 표시 해제
                  </button>
                </div>
              </div>
            ) : subCount > 0 ? (
              // 대표: 동일 번지 SUB 목록 + 개별 표시 토글 (펼치기/숨기기)
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
                <button
                  type="button"
                  onClick={() => setOpenSubList((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-900/40"
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                    <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                    동일 번지 국소 개별 배치
                    <span className="font-normal normal-case text-slate-500">
                      ({subCount})
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-slate-500">
                    {openSubList ? '숨기기' : '펼치기'}
                    {openSubList ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </span>
                </button>
                {openSubList ? (
                  <div className="space-y-2 border-t border-slate-800/80 px-4 pb-4 pt-3">
                    <p className="text-[11px] leading-relaxed text-slate-500">
                      같은 지번은 기본적으로 대표 1개만 지도에 표시됩니다. 동(棟)을 개별
                      표시하면 그 동의 대표 핀 1개만 나타나고, 같은 동 SUB는 숨깁니다.
                      국소를 고르면 그 국소가 동 대표가 됩니다.
                    </p>

                    {/* 구역(동/지하/기타) 실제 그룹 분리 · 합치기 */}
                    {relatedIsSplit ? (
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-700/40 bg-amber-950/20 px-3 py-2">
                        <span className="min-w-0 text-[11px] leading-relaxed text-amber-200/90">
                          이 그룹은 번지에서{' '}
                          <span className="font-semibold">분리</span>된 독립
                          그룹입니다. 되돌리면 원래 번지 그룹으로 합쳐집니다.
                        </span>
                        <button
                          onClick={mergeSplitGroupToLot}
                          disabled={mergingSplit}
                          title="이 분리 그룹을 원래 번지 그룹으로 되돌립니다"
                          className="shrink-0 rounded-lg border border-amber-600/50 bg-amber-600/20 px-2.5 py-1 text-[10px] font-medium text-amber-200 transition-colors hover:bg-amber-600/30 disabled:opacity-50"
                        >
                          {mergingSplit ? '합치는 중…' : '번지로 합치기'}
                        </button>
                      </div>
                    ) : canSplit ? (
                      <div className="space-y-1.5 rounded-lg border border-slate-800/70 bg-slate-900/30 px-3 py-2">
                        <p className="text-[11px] leading-relaxed text-slate-400">
                          구역(동/지하/기타)을{' '}
                          <span className="font-semibold text-slate-200">
                            분리
                          </span>
                          하면 번지 그룹에서 빠져 독립 대표+SUB 그룹이 됩니다.
                          대표가 빠지면 남은 국소 중 하나가 새 대표가 됩니다.
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {separationLabelCounts.map(([label, count]) => {
                            const busy = separatingLabel === label;
                            const picking = pickingSplitLabel === label;
                            const labelMarkers = relatedEquipmentMarkers.filter(
                              (m) => getMarkerDongLabel(m) === label,
                            );
                            return (
                              <div
                                key={label}
                                className="rounded-lg border border-slate-800/70 bg-slate-950/30"
                              >
                                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                                  <span className="text-[11px] font-medium text-slate-200">
                                    {label}
                                    <span className="ml-1 font-normal text-slate-500">
                                      ({count})
                                    </span>
                                  </span>
                                  {count === 1 ? (
                                    // 1개면 대표 선택 불필요 — 바로 분리
                                    <button
                                      onClick={() => separateLabelGroup(label)}
                                      disabled={busy}
                                      title={`'${label}' 국소를 번지에서 분리합니다`}
                                      className="shrink-0 rounded-lg border border-sky-600/50 bg-sky-600/15 px-2.5 py-1 text-[10px] font-medium text-sky-200 transition-colors hover:bg-sky-600/25 disabled:opacity-50"
                                    >
                                      {busy ? '분리 중…' : '분리'}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        setPickingSplitLabel(
                                          picking ? null : label,
                                        )
                                      }
                                      disabled={busy}
                                      title="대표로 지정할 국소를 고른 뒤 분리합니다"
                                      className={`shrink-0 rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors disabled:opacity-50 ${
                                        picking
                                          ? 'border-slate-600 bg-slate-700 text-slate-100'
                                          : 'border-sky-600/50 bg-sky-600/15 text-sky-200 hover:bg-sky-600/25'
                                      }`}
                                    >
                                      {busy
                                        ? '분리 중…'
                                        : picking
                                          ? '대표 선택 닫기'
                                          : '분리 (대표 선택)'}
                                    </button>
                                  )}
                                </div>
                                {picking && count > 1 ? (
                                  <div className="border-t border-slate-800/70 px-2.5 py-1.5">
                                    <p className="mb-1 text-[10px] text-slate-500">
                                      대표로 지정할 국소를 선택하면 분리됩니다.
                                    </p>
                                    <ul className="flex flex-col divide-y divide-slate-800/60">
                                      {labelMarkers.map((m) => (
                                        <li
                                          key={m.id}
                                          className="flex items-center justify-between gap-3 py-1.5"
                                        >
                                          <span className="min-w-0 truncate text-[11px] text-slate-200">
                                            {m.finalStationName || m.name}
                                          </span>
                                          <button
                                            onClick={() =>
                                              separateLabelGroup(label, m.id)
                                            }
                                            disabled={busy}
                                            className="shrink-0 rounded-lg border border-emerald-500/50 bg-emerald-600/20 px-2.5 py-1 text-[10px] font-medium text-emerald-300 transition-colors hover:bg-emerald-600/30 disabled:opacity-50"
                                          >
                                            대표로 분리
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {detachedSubCount > 0 ? (
                      <div className="flex justify-end">
                        <button
                          onClick={mergeAllDetachedSubs}
                          disabled={merging}
                          title="개별 표시된 국소를 모두 다시 대표 1개로 합칩니다"
                          className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
                        >
                          {merging ? '합치는 중…' : `모두 합치기 (${detachedSubCount})`}
                        </button>
                      </div>
                    ) : null}
                    <div className="flex flex-col gap-3">
                      {dongGroups.map((group) => {
                        const busy = detachingGroup === group.label;
                        return (
                          <div
                            key={group.label}
                            className="overflow-hidden rounded-lg border border-slate-800/70 bg-slate-900/30"
                          >
                            {/* 동 헤더 + 동 대표 1핀 토글 */}
                            <div className="flex items-center justify-between gap-3 bg-slate-900/50 px-3 py-1.5">
                              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                                <Building2 className="h-3 w-3 text-emerald-400" />
                                {group.label}
                                <span className="font-normal text-slate-500">
                                  ({group.subs.length})
                                </span>
                              </span>
                              <button
                                onClick={() =>
                                  setGroupDetached(
                                    group.label,
                                    group.subs,
                                    !group.isDongShown,
                                  )
                                }
                                disabled={busy}
                                title={
                                  group.isDongShown
                                    ? `${group.label} 대표 핀을 지도에서 숨깁니다`
                                    : `${group.label} 대표 1국소만 지도에 표시합니다`
                                }
                                className={`shrink-0 rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors disabled:opacity-50 ${
                                  group.isDongShown
                                    ? 'border-emerald-500/50 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                                    : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                                }`}
                              >
                                {busy
                                  ? '적용 중…'
                                  : group.isDongShown
                                    ? '동 숨기기'
                                    : '동 개별 표시'}
                              </button>
                            </div>
                            {/* 동 내 국소: 동 대표 지정 */}
                            <ul className="flex flex-col divide-y divide-slate-800/60 px-3">
                              {group.subs.map((sub) => (
                                <li
                                  key={sub.id}
                                  className="flex items-center justify-between gap-3 py-1.5"
                                >
                                  <span className="min-w-0 truncate text-xs text-slate-200">
                                    {sub.finalStationName || sub.name}
                                    {sub.id === group.mapRepId &&
                                    group.isDongShown ? (
                                      <span className="ml-1.5 text-[10px] font-medium text-emerald-400">
                                        대표
                                      </span>
                                    ) : null}
                                  </span>
                                  <button
                                    onClick={() =>
                                      setMarkerDetached(
                                        sub.id,
                                        !sub.detachedVisible,
                                      )
                                    }
                                    disabled={detachingId === sub.id}
                                    className={`shrink-0 rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors disabled:opacity-50 ${
                                      sub.detachedVisible
                                        ? 'border-emerald-500/50 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                                        : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                                    }`}
                                  >
                                    {sub.detachedVisible
                                      ? '대표 · 숨기기'
                                      : '동 대표로 표시'}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : relatedIsSplit ? (
              // 분리된 단독 그룹(SUB 없음): 번지로 합치기만 제공
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-700/40 bg-amber-950/20 p-4">
                <div className="min-w-0 text-xs text-amber-200/90">
                  이 국소는 번지에서{' '}
                  <span className="font-semibold">분리</span>된 독립 그룹입니다.
                  되돌리면 원래 번지 그룹으로 합쳐집니다.
                </div>
                <button
                  onClick={mergeSplitGroupToLot}
                  disabled={mergingSplit}
                  className="shrink-0 rounded-lg border border-amber-600/50 bg-amber-600/20 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 transition-colors hover:bg-amber-600/30 disabled:opacity-50"
                >
                  {mergingSplit ? '합치는 중…' : '번지로 합치기'}
                </button>
              </div>
            ) : null
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
              <span className="hidden items-center gap-1 text-[10px] font-normal text-slate-500 sm:flex">
                <Lock className="h-2.5 w-2.5" />
                셀 드래그 선택 후 복사 지원
              </span>
            </h4>
            <div className="flex shrink-0 gap-2">
              {selectedCells.size > 0 && (
                <button
                  onClick={handleCopySelected}
                  className="flex items-center gap-1 rounded-lg border border-emerald-500/50 bg-emerald-600/20 px-2.5 py-1.5 text-[10px] font-medium text-emerald-300 transition-all hover:bg-emerald-600/30"
                >
                  <Check className="h-3 w-3" />
                  선택 셀 복사
                </button>
              )}
              <button
                onClick={handleCopyTable}
                className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[10px] font-medium text-slate-200 transition-all hover:bg-slate-700"
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
                                    className="max-w-[5.5rem] rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] font-medium text-slate-100 outline-none focus:border-emerald-500/60 disabled:opacity-50"
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
