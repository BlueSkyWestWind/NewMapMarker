'use client';

import { Building2, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import type { useMarkerGroupActions } from '@/features/map-marker/hooks/use-marker-group-actions';
import { getMarkerDongLabel } from '@/features/map-marker/lib/marker-detail-rows';
import {
  buildSeparationLabelCounts,
  canSplitGroup,
  type DongGroup,
} from '@/features/map-marker/lib/marker-group-view';
import type { EquipmentMarker } from '@/features/map-marker/types/marker';

interface MarkerDetailSubPlacementProps {
  actions: ReturnType<typeof useMarkerGroupActions>;
  equipmentMarker: EquipmentMarker;
  relatedEquipmentMarkers: EquipmentMarker[];
  dongGroups: DongGroup[];
  subCount: number;
  openSubList: boolean;
  onToggleSubList: () => void;
}

/**
 * 장비 상세 모달의 같은 번지 국소 개별 배치 · 동 분리/합치기 구역.
 */
export function MarkerDetailSubPlacement({
  actions,
  equipmentMarker,
  relatedEquipmentMarkers,
  dongGroups,
  subCount,
  openSubList,
  onToggleSubList,
}: MarkerDetailSubPlacementProps) {
  const {
    detachingId,
    merging,
    detachingGroup,
    separatingLabel,
    pickingSplitLabel,
    setPickingSplitLabel,
    mergingSplit,
    setMarkerDetached,
    mergeAllDetachedSubs,
    setGroupDetached,
    separateLabelGroup,
    mergeSplitGroupToLot,
  } = actions;

  // 현재 지도에 개별 표시된(합칠 수 있는) SUB 수
  const detachedSubCount = relatedEquipmentMarkers.filter(
    (sub) => sub.parentMarkerId && sub.detachedVisible,
  ).length;

  // 현재 보고 있는 그룹이 번지에서 분리된(group_key 있는) 그룹인지.
  const relatedIsSplit = relatedEquipmentMarkers.some((m) =>
    (m.groupKey ?? '').trim(),
  );
  // 번지 그룹 안의 분리 라벨(동/지하/기타)별 개수. 2개 이상이면 분리 의미가 있음.
  const separationLabelCounts = buildSeparationLabelCounts(
    relatedEquipmentMarkers,
  );
  const canSplit = canSplitGroup(relatedEquipmentMarkers);

  if (equipmentMarker.parentMarkerId) {
    // 이 마커 자체가 개별 표시된 SUB
    return (
      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-4">
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
    );
  }

  if (subCount > 0) {
    // 대표: 동일 번지 SUB 목록 + 개별 표시 토글 (펼치기/숨기기)
    return (
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-800/80 bg-slate-950/40">
        <button
          type="button"
          onClick={onToggleSubList}
          className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-900/40"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
            <MapPin className="h-3.5 w-3.5 text-emerald-400" />
            동일 번지 국소 개별 배치
            <span className="font-normal normal-case text-slate-500">
              ({subCount})
            </span>
          </span>
          <span className="flex items-center gap-1 text-[11px] text-slate-500">
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
                  className="shrink-0 rounded-lg border border-amber-600/50 bg-amber-600/20 px-2.5 py-1 text-[11px] font-medium text-amber-200 transition-colors hover:bg-amber-600/30 disabled:opacity-50"
                >
                  {mergingSplit ? '합치는 중…' : '번지로 합치기'}
                </button>
              </div>
            ) : canSplit ? (
              <div className="space-y-1.5 rounded-lg border border-slate-800/70 bg-slate-900/30 px-3 py-2">
                <p className="text-[11px] leading-relaxed text-slate-400">
                  구역(동/지하/기타)을{' '}
                  <span className="font-semibold text-slate-200">분리</span>
                  하면 번지 그룹에서 빠져 독립 대표+SUB 그룹이 됩니다. 대표가
                  빠지면 남은 국소 중 하나가 새 대표가 됩니다.
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
                              className="shrink-0 rounded-lg border border-sky-600/50 bg-sky-600/15 px-2.5 py-1 text-[11px] font-medium text-sky-200 transition-colors hover:bg-sky-600/25 disabled:opacity-50"
                            >
                              {busy ? '분리 중…' : '분리'}
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                setPickingSplitLabel(picking ? null : label)
                              }
                              disabled={busy}
                              title="대표로 지정할 국소를 고른 뒤 분리합니다"
                              className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
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
                            <p className="mb-1 text-[11px] text-slate-500">
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
                                    className="shrink-0 rounded-lg border border-emerald-500/50 bg-emerald-600/20 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-600/30 disabled:opacity-50"
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
                  className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
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
                        className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
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
                            {sub.id === group.mapRepId && group.isDongShown ? (
                              <span className="ml-1.5 text-[11px] font-medium text-emerald-400">
                                대표
                              </span>
                            ) : null}
                          </span>
                          <button
                            onClick={() =>
                              setMarkerDetached(sub.id, !sub.detachedVisible)
                            }
                            disabled={detachingId === sub.id}
                            className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
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
    );
  }

  if (relatedIsSplit) {
    // 분리된 단독 그룹(SUB 없음): 번지로 합치기만 제공
    return (
      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-amber-700/40 bg-amber-950/20 p-4">
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
    );
  }

  return null;
}
