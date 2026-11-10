"use client";

import { useMemo, useState } from "react";
import { ListPlus, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getColorDisplayName } from "@/features/map-marker/constants/facility-teams";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import type { EquipmentMarker, MarkerRecord } from "@/features/map-marker/types/marker";
import { PanelSection } from "@/features/shell/components/panels/panel-section";
import {
  createSiteList,
  deleteSiteList,
  updateSiteList,
} from "@/features/site-lists/api";
import { SiteListMembersDialog } from "@/features/site-lists/components/site-list-members-dialog";
import { useSiteLists } from "@/features/site-lists/hooks/use-site-lists";
import {
  canEditSiteList,
  SITE_LIST_COLORS,
} from "@/features/site-lists/lib/site-list-view";
import type { SiteList } from "@/features/site-lists/types";
import { useToast } from "@/hooks/use-toast";

/** 위치 메뉴. 목록을 만들고, 고른 목록의 국소를 지도와 목록에 표시한다. */
export function SiteListsPanel({ markers }: { markers: MarkerRecord[] }) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const { lists, members, isAdmin, isLoading, isTableMissing, error, refresh } =
    useSiteLists();
  const selectedIds = useMapMarkerStore((state) => state.selectedSiteListIds);
  const toggleSiteList = useMapMarkerStore((state) => state.toggleSiteList);
  const selectedMarkerId = useMapMarkerStore((state) => state.selectedMarkerId);
  const setSelectedMarkerId = useMapMarkerStore((state) => state.setSelectedMarkerId);

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(SITE_LIST_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [managing, setManaging] = useState<SiteList | null>(null);
  const [siteFilter, setSiteFilter] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  // 평소에는 접어 둔다. 목록을 고르는 일이 훨씬 잦고, 모바일 시트는 공간이 좁다.
  const showForm = isFormOpen || editingId !== null || (!isLoading && lists.length === 0);

  const memberCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const member of members) {
      counts.set(member.listId, (counts.get(member.listId) ?? 0) + 1);
    }
    return counts;
  }, [members]);

  const visibleSites = useMemo(() => {
    const needle = siteFilter.trim().toLowerCase();
    if (!needle) return markers;
    return markers.filter((marker) => {
      const site = marker as EquipmentMarker;
      return [site.name, site.jibunAddress, site.roadAddress, site.facilityCode].some(
        (value) => (value ?? "").toLowerCase().includes(needle),
      );
    });
  }, [markers, siteFilter]);

  const run = async (action: () => Promise<void>, failure: string) => {
    if (!supabase) return false;
    setIsBusy(true);
    try {
      await action();
      await refresh();
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "알 수 없는 오류";
      toast({ variant: "destructive", description: `${failure}: ${message}` });
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const resetForm = () => {
    setName("");
    setColor(SITE_LIST_COLORS[0]);
    setEditingId(null);
    setIsFormOpen(false);
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const saved = await run(
      () =>
        editingId
          ? updateSiteList(supabase!, editingId, { name: trimmed, color })
          : createSiteList(supabase!, { name: trimmed, color, isAdmin }),
      "목록 저장 실패",
    );
    if (saved) resetForm();
  };

  const remove = async (list: SiteList) => {
    if (
      !window.confirm(
        `"${list.name}" 목록을 삭제할까요? 목록만 지워지고 장비 국소는 그대로 남습니다.`,
      )
    ) {
      return;
    }
    if (selectedIds.includes(list.id)) toggleSiteList(list.id);
    await run(() => deleteSiteList(supabase!, list.id), "목록 삭제 실패");
  };

  if (isTableMissing) {
    return (
      <PanelSection title="국소 목록">
        <p className="text-xs leading-relaxed text-amber-300">
          DB 변경이 아직 적용되지 않았습니다. Supabase SQL Editor에서
          02_site_lists_and_permissions.sql을 실행해 주세요.
        </p>
      </PanelSection>
    );
  }

  return (
    <div className="space-y-3">
      {/* 새 목록·목록·국소 검색은 국소 목록을 스크롤해도 위에 고정한다. 목록이 길면 이 영역 안에서 스크롤한다. */}
      <div className="sticky top-0 z-10 max-h-[60vh] space-y-3 overflow-y-auto bg-slate-950 pb-2">
      {showForm ? (
      <PanelSection title={editingId ? "목록 수정" : "새 목록"}>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="목록 이름 (예: 철거대상, 고속도로)"
            aria-label="목록 이름"
            className="h-9 border-slate-700 bg-slate-900 text-xs"
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="목록 색상">
            {SITE_LIST_COLORS.map((value) => (
              <button
                key={value}
                type="button"
                aria-label={getColorDisplayName(value)}
                aria-pressed={color === value}
                title={getColorDisplayName(value)}
                className={`h-6 w-6 rounded-full border-2 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  color === value ? "border-slate-100" : "border-transparent"
                }`}
                style={{ backgroundColor: value }}
                onClick={() => setColor(value)}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {editingId || lists.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="h-8 flex-1 border-slate-700 text-xs text-slate-200"
                onClick={resetForm}
              >
                취소
              </Button>
            ) : null}
            <Button
              type="submit"
              className="h-8 flex-1 bg-indigo-600 text-xs hover:bg-indigo-500"
              disabled={isBusy || !name.trim()}
            >
              {editingId ? "저장" : "목록 만들기"}
            </Button>
          </div>
        </form>
      </PanelSection>
      ) : (
        <Button
          type="button"
          className="h-9 w-full bg-indigo-600 text-xs hover:bg-indigo-500"
          onClick={() => setIsFormOpen(true)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
          새 목록
        </Button>
      )}

      <PanelSection title={`목록 (${lists.length})`}>
        {error && !isTableMissing ? (
          <p className="text-xs text-rose-300">목록을 불러오지 못했습니다.</p>
        ) : isLoading ? (
          <p className="text-xs text-slate-400">불러오는 중...</p>
        ) : lists.length === 0 ? (
          <p className="text-xs text-slate-400">
            아직 목록이 없습니다. 위에서 첫 목록을 만들어 보세요.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {lists.map((list) => {
              const canEdit = canEditSiteList(list, isAdmin);
              return (
                <li key={list.id} className="flex items-center gap-1 rounded-md hover:bg-slate-800/50">
                  <label className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 px-1.5 text-xs">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-indigo-500"
                      checked={selectedIds.includes(list.id)}
                      onChange={() => toggleSiteList(list.id)}
                    />
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: list.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 truncate font-medium text-slate-100" title={list.name}>
                      {list.name}
                    </span>
                    {list.isAdminList ? (
                      <Lock
                        className="h-3 w-3 shrink-0 text-slate-400"
                        aria-label="관리자 목록"
                      />
                    ) : null}
                    <span className="ml-auto shrink-0 text-[11px] text-slate-400">
                      {memberCounts.get(list.id) ?? 0}
                    </span>
                  </label>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-slate-300"
                    title="국소 관리"
                    aria-label={`${list.name} 국소 관리`}
                    onClick={() => setManaging(list)}
                  >
                    <ListPlus className="h-4 w-4" />
                  </Button>
                  {canEdit ? (
                    <>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-slate-300"
                        title="이름·색상 수정"
                        aria-label={`${list.name} 수정`}
                        onClick={() => {
                          setEditingId(list.id);
                          setName(list.name);
                          setColor(list.color);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-rose-300"
                        title="목록 삭제"
                        aria-label={`${list.name} 삭제`}
                        disabled={isBusy}
                        onClick={() => void remove(list)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </PanelSection>

      <PanelSection title={`표시 중인 국소 (${markers.length})`}>
        {selectedIds.length === 0 ? (
          <p className="text-xs text-slate-400">
            목록을 고르면 해당 국소가 지도와 여기에 표시됩니다.
          </p>
        ) : (
          <Input
            value={siteFilter}
            onChange={(event) => setSiteFilter(event.target.value)}
            placeholder="국소명·주소로 찾기..."
            aria-label="표시 중인 국소 찾기"
            className="h-8 border-slate-700 bg-slate-900 text-xs"
          />
        )}
      </PanelSection>
      </div>

      {selectedIds.length > 0 ? (
        visibleSites.length === 0 ? (
          <p className="p-3 text-center text-xs text-slate-400">표시할 국소가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-800/80 rounded-lg border border-slate-800">
            {visibleSites.map((marker) => {
              const site = marker as EquipmentMarker;
              const address = site.jibunAddress || site.roadAddress;
              return (
                <li key={marker.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-800/50 ${
                      marker.id === selectedMarkerId ? "bg-indigo-500/10" : ""
                    }`}
                    onClick={() => setSelectedMarkerId(marker.id)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-100" title={marker.name}>
                        {marker.name || "이름 없음"}
                      </span>
                      <span className="block truncate text-[11px] text-slate-400" title={address}>
                        {address || "주소 없음"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1" aria-hidden>
                      {(marker.siteListColors ?? []).map((value) => (
                        <span
                          key={value}
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: value }}
                        />
                      ))}
                      {marker.siteListExtraCount ? (
                        <span className="text-[11px] text-slate-400">+{marker.siteListExtraCount}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      {managing ? (
        <SiteListMembersDialog
          list={managing}
          canEdit={canEditSiteList(managing, isAdmin)}
          onClose={() => setManaging(null)}
        />
      ) : null}
    </div>
  );
}
