'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import { useAuthSession } from '@/lib/auth/use-auth-session';
import { MAP_MARKER_QUERY_KEY } from '@/features/map-marker/constants/map-config';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  MarkerOpsError,
  applyMarkerOps,
} from '@/features/group-admin/lib/group-ops';
import {
  planMergeSplitToLot,
  planRoleChange,
  planSeparate,
} from '@/features/group-admin/lib/group-actions';
import type { GroupRole } from '@/features/map-marker/lib/address-group';
import {
  dbErrorMessage,
  getMarkerDongLabel,
  pickDongMapRepresentative,
  storedGroupRoleOf,
} from '@/features/map-marker/lib/marker-detail-rows';
import type { EquipmentMarker, MarkerRecord } from '@/features/map-marker/types/marker';

/**
 * 마커 상세 모달의 그룹 편집 동작(개별 표시·동 단위 표시·구분 변경·번지 분리/합치기).
 * 모두 로그인한 사용자만 저장하고, 끝나면 마커 목록을 다시 불러온다.
 * `relatedEquipmentMarkers`는 같은 번지 그룹(대표+SUB 전체)이다.
 */
export function useMarkerGroupActions({
  markers,
  relatedEquipmentMarkers,
}: {
  markers: MarkerRecord[];
  relatedEquipmentMarkers: EquipmentMarker[];
}) {
  const supabase = getSupabaseBrowserClient();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthSession();
  const { toast } = useToast();
  const closeAllModals = useMapMarkerStore((state) => state.closeAllModals);

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
   * 국소 구분(대표/단독/SUB)을 DB에 저장한다. 계획은 planRoleChange가 만든다.
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
      const { ops, notice } = planRoleChange(target, nextRole, allEquipment);
      await applyMarkerOps(supabase, ops);
      toast({ description: notice });
      await queryClient.invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY });
    } catch (err) {
      console.error('구분 변경 실패:', err);
      toast({
        variant: 'destructive',
        description: dbErrorMessage(
          err instanceof MarkerOpsError ? err.cause : err,
          '구분 변경에 실패했습니다.',
        ),
      });
    } finally {
      setChangingRoleId(null);
    }
  };

  /**
   * 라벨(동/지하/기타) 국소들을 번지 그룹에서 빼내 독립 그룹(대표+SUB)으로 분리한다.
   * 계획은 planSeparate가 만든다(남은 번지 그룹 재승격 → 분리 그룹 순).
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
      const { ops } = planSeparate(targets, remaining, label, repId);
      await applyMarkerOps(supabase, ops);
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
        description: dbErrorMessage(
          err instanceof MarkerOpsError ? err.cause : err,
          '분리에 실패했습니다.',
        ),
      });
    } finally {
      setSeparatingLabel(null);
    }
  };

  /**
   * 현재 보고 있는 분리 그룹(group_key)을 번지 그룹으로 되돌린다(원복).
   * 계획은 planMergeSplitToLot이 만든다.
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

    setMergingSplit(true);
    try {
      const { ops } = planMergeSplitToLot(
        splitMembers,
        markers as EquipmentMarker[],
      );
      await applyMarkerOps(supabase, ops);
      await queryClient.invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY });
      toast({ description: '분리를 해제하고 번지 그룹으로 합쳤습니다.' });
    } catch (err) {
      console.error('번지로 합치기 실패:', err);
      toast({
        variant: 'destructive',
        description: dbErrorMessage(
          err instanceof MarkerOpsError ? err.cause : err,
          '번지로 합치기에 실패했습니다.',
        ),
      });
    } finally {
      setMergingSplit(false);
    }
  };

  return {
    detachingId,
    merging,
    detachingGroup,
    changingRoleId,
    separatingLabel,
    pickingSplitLabel,
    setPickingSplitLabel,
    mergingSplit,
    setMarkerDetached,
    mergeAllDetachedSubs,
    setGroupDetached,
    changeMarkerGroupRole,
    separateLabelGroup,
    mergeSplitGroupToLot,
  };
}
