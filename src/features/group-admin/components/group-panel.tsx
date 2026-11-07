"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Maximize2, Pencil, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMarkerGroups } from "@/features/group-admin/hooks/use-marker-groups";
import { filterGroups } from "@/features/group-admin/lib/group-filters";
import type { GroupFilters, MarkerGroup } from "@/features/group-admin/types";
import {
  getMarkerFilterYears,
  normalizeFilterValue,
} from "@/features/map-marker/lib/marker-filters";
import { storedGroupRoleOf } from "@/features/map-marker/lib/marker-detail-rows";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { PanelSection } from "@/features/shell/components/panels/panel-section";

const GroupManageDialog = dynamic(
  () => import("./group-manage-dialog").then((m) => m.GroupManageDialog),
  { ssr: false },
);

/** 한 번에 그리는 묶음 수. 마커가 수천 개라 전부 그리면 패널이 무거워진다. */
const PAGE_SIZE = 200;
const DEFAULT_STATUS = "올해 대상 없음";

const EMPTY_FILTERS: GroupFilters = {
  query: "",
  years: [],
  statuses: [],
  businesses: [],
  onlyNoCoord: false,
  onlySuspect: false,
};

type ListFilterKey = "years" | "statuses" | "businesses";

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "ko"));
}

function ToggleChip({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`h-6 shrink-0 whitespace-nowrap rounded-full border px-2 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        pressed
          ? "border-indigo-400 bg-indigo-500/20 text-indigo-100"
          : "border-slate-700 text-slate-300 hover:bg-slate-800/60"
      }`}
    >
      {label}
    </button>
  );
}

/** 그룹관리 메뉴. 번지 묶음을 고르면 해당 마커가 지도에 올라온다. */
export function GroupPanel() {
  const groups = useMarkerGroups();
  const selectedKeys = useMapMarkerStore((state) => state.selectedGroupKeys);
  const toggleGroupKey = useMapMarkerStore((state) => state.toggleGroupKey);
  const setGroupKeys = useMapMarkerStore((state) => state.setGroupKeys);
  const lastGroupManageKey = useMapMarkerStore((state) => state.lastGroupManageKey);
  const groupManageKey = useMapMarkerStore((state) => state.groupManageKey);
  const setGroupManageKey = useMapMarkerStore((state) => state.setGroupManageKey);

  const [filters, setFilters] = useState<GroupFilters>(EMPTY_FILTERS);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isBulkOpen, setIsBulkOpen] = useState(false);

  const options = useMemo(
    () => ({
      years: sortedUnique(groups.flatMap((g) => g.markers.flatMap(getMarkerFilterYears))),
      statuses: sortedUnique(
        groups.flatMap((g) => g.markers.map((m) => m.facilityStatus ?? DEFAULT_STATUS)),
      ),
      businesses: sortedUnique(
        groups.flatMap((g) => g.markers.map((m) => normalizeFilterValue(m.businessType))),
      ),
    }),
    [groups],
  );

  const filtered = useMemo(() => filterGroups(groups, filters), [groups, filters]);
  const shown = filtered.slice(0, visibleCount);
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const update = (patch: Partial<GroupFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setVisibleCount(PAGE_SIZE);
  };

  const toggleOption = (key: ListFilterKey, value: string) => {
    const current = filters[key];
    update({
      [key]: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  };

  const lastGroup = groups.find((g) => g.key === lastGroupManageKey) ?? null;
  const lastHead = lastGroup ? (lastGroup.representative ?? lastGroup.markers[0]) : null;
  const openManage = () => {
    const target = lastGroup ?? filtered[0] ?? groups[0];
    if (target) setGroupManageKey(target.key);
  };

  const allShownSelected = shown.length > 0 && shown.every((g) => selectedSet.has(g.key));
  const toggleAllShown = () => {
    const shownKeys = shown.map((g) => g.key);
    setGroupKeys(
      allShownSelected
        ? selectedKeys.filter((key) => !shownKeys.includes(key))
        : [...new Set([...selectedKeys, ...shownKeys])],
    );
  };

  const filterRows: { key: ListFilterKey; title: string; values: string[] }[] = [
    { key: "years", title: "연도", values: options.years },
    { key: "statuses", title: "상태", values: options.statuses },
    { key: "businesses", title: "사업", values: options.businesses },
  ];

  return (
    <div className="space-y-3">
      {groupManageKey ? <GroupManageDialog /> : null}
      <div className="flex gap-2">
        <Button
          type="button"
          className="h-9 flex-1 bg-indigo-600 text-xs hover:bg-indigo-500"
          disabled={groups.length === 0}
          onClick={openManage}
        >
          <Maximize2 className="mr-1 h-3.5 w-3.5" aria-hidden />
          전체 화면 관리
        </Button>
        {selectedKeys.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            className="h-9 flex-1 border-slate-700 text-xs text-slate-200"
            onClick={() => setIsBulkOpen((open) => !open)}
          >
            <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />
            일괄 수정 ({selectedKeys.length})
          </Button>
        ) : null}
      </div>
      {lastGroup && !groupManageKey ? (
        <Button
          type="button"
          variant="outline"
          className="h-8 w-full justify-start border-slate-700 text-xs text-slate-200"
          onClick={() => setGroupManageKey(lastGroup.key)}
        >
          <Undo2 className="mr-1 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">
            방금 보던 묶음 다시 열기 ({lastHead?.name || "이름 없음"})
          </span>
        </Button>
      ) : null}
      {isBulkOpen && selectedKeys.length > 0 ? (
        <p className="text-xs text-slate-400">
          선택한 {selectedKeys.length}개 묶음의 일괄 수정은 아직 준비 중입니다.
        </p>
      ) : null}

      <PanelSection title="검색·필터">
        <Input
          value={filters.query}
          onChange={(event) => update({ query: event.target.value })}
          placeholder="국소명·주소로 찾기..."
          aria-label="묶음 찾기"
          className="mb-2 h-8 border-slate-700 bg-slate-900 text-xs"
        />
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip
            label="좌표 없음"
            pressed={filters.onlyNoCoord}
            onClick={() => update({ onlyNoCoord: !filters.onlyNoCoord })}
          />
          <ToggleChip
            label="중복 의심"
            pressed={filters.onlySuspect}
            onClick={() => update({ onlySuspect: !filters.onlySuspect })}
          />
        </div>
        {filterRows.map((row) =>
          row.values.length === 0 ? null : (
            <div key={row.key} className="mt-2">
              <p className="mb-1 text-[11px] text-slate-400">{row.title}</p>
              <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
                {row.values.map((value) => (
                  <ToggleChip
                    key={value}
                    label={value}
                    pressed={filters[row.key].includes(value)}
                    onClick={() => toggleOption(row.key, value)}
                  />
                ))}
              </div>
            </div>
          ),
        )}
      </PanelSection>

      <PanelSection title={`묶음 (${filtered.length}/${groups.length})`}>
        {filtered.length === 0 ? (
          <p className="p-3 text-center text-xs text-slate-400">
            {groups.length === 0 ? "묶음이 없습니다." : "조건에 맞는 묶음이 없습니다."}
          </p>
        ) : (
          <>
            <label className="mb-1 flex min-h-8 cursor-pointer items-center gap-2 px-1.5 text-[11px] text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-indigo-500"
                checked={allShownSelected}
                onChange={toggleAllShown}
              />
              보이는 묶음 모두 선택
              <span className="ml-auto shrink-0 text-slate-400">
                선택 {selectedKeys.length}
              </span>
            </label>
            <ul className="divide-y divide-slate-800/80 rounded-lg border border-slate-800">
              {shown.map((group) => (
                <GroupRow
                  key={group.key}
                  group={group}
                  checked={selectedSet.has(group.key)}
                  onToggle={() => toggleGroupKey(group.key)}
                />
              ))}
            </ul>
            {filtered.length > shown.length ? (
              <Button
                type="button"
                variant="outline"
                className="mt-2 h-8 w-full border-slate-700 text-xs text-slate-200"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                더 보기 ({filtered.length - shown.length}건 남음)
              </Button>
            ) : null}
          </>
        )}
      </PanelSection>
    </div>
  );
}

function GroupRow({
  group,
  checked,
  onToggle,
}: {
  group: MarkerGroup;
  checked: boolean;
  onToggle: () => void;
}) {
  const head = group.representative ?? group.markers[0];
  const hasStoredRepresentative = storedGroupRoleOf(head) === "대표";
  const address = group.lotAddress || head.jibunAddress || head.roadAddress;
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs hover:bg-slate-800/50">
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-indigo-500"
          checked={checked}
          onChange={onToggle}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate font-medium text-slate-100" title={head.name}>
              {head.name || "이름 없음"}
            </span>
            {hasStoredRepresentative ? (
              <span className="shrink-0 rounded bg-indigo-500/20 px-1 text-[10px] text-indigo-200">
                대표
              </span>
            ) : null}
            {group.isSuspect ? (
              <span className="shrink-0 rounded bg-amber-500/20 px-1 text-[10px] text-amber-200">
                중복 의심
              </span>
            ) : null}
            {group.hasNoCoord ? (
              <span className="shrink-0 rounded bg-rose-500/20 px-1 text-[10px] text-rose-200">
                좌표 없음
              </span>
            ) : null}
          </span>
          <span className="block truncate text-[11px] text-slate-400" title={address}>
            {address || "주소 없음"}
          </span>
        </span>
        <span className="shrink-0 text-[11px] text-slate-400">{group.markers.length}</span>
      </label>
    </li>
  );
}
