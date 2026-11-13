"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useMapMarkersQuery } from "@/features/map-marker/hooks/use-map-markers-query";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import { addSiteListMembers, removeSiteListMembers } from "@/features/site-lists/api";
import { useSiteLists } from "@/features/site-lists/hooks/use-site-lists";
import {
  findMissingCodes,
  searchEquipmentSites,
} from "@/features/site-lists/lib/site-list-view";
import type { SiteList } from "@/features/site-lists/types";
import { useToast } from "@/hooks/use-toast";

/** 검색 결과를 한 번에 그리는 상한. 넘으면 검색어를 좁히도록 안내한다. */
const RESULT_LIMIT = 200;

function SiteRow({
  marker,
  checked,
  disabled,
  note,
  onToggle,
}: {
  marker: EquipmentMarker;
  checked: boolean;
  disabled?: boolean;
  note?: string;
  onToggle: () => void;
}) {
  const address = marker.jibunAddress || marker.roadAddress;
  return (
    <label
      className={`flex min-h-11 items-center gap-2 px-3 py-1.5 text-xs ${
        disabled ? "opacity-60" : "cursor-pointer hover:bg-slate-800/60"
      }`}
    >
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 accent-indigo-500"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-slate-100" title={marker.name}>
          {marker.name || "이름 없음"}
        </span>
        <span className="block truncate text-[11px] text-slate-400" title={address}>
          {[marker.facilityCode, address].filter(Boolean).join(" · ") || "주소 없음"}
        </span>
      </span>
      {note ? <span className="shrink-0 text-[11px] text-slate-400">{note}</span> : null}
    </label>
  );
}

interface SiteListMembersDialogProps {
  list: SiteList;
  canEdit: boolean;
  onClose: () => void;
}

/** 한 목록의 국소 관리. 검색해서 여러 건을 추가하고, 여러 건을 뺀다. */
export function SiteListMembersDialog({
  list,
  canEdit,
  onClose,
}: SiteListMembersDialogProps) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const { data } = useMapMarkersQuery();
  const { members, refresh } = useSiteLists();
  const [query, setQuery] = useState("");
  const [toAdd, setToAdd] = useState<Set<string>>(new Set());
  const [toRemove, setToRemove] = useState<Set<string>>(new Set());
  const [isBusy, setIsBusy] = useState(false);

  const allSites = data?.equipmentMarkers;
  const memberIds = useMemo(
    () =>
      new Set(
        members.filter((m) => m.listId === list.id).map((m) => m.markerId),
      ),
    [members, list.id],
  );
  const currentSites = useMemo(
    () => (allSites ?? []).filter((marker) => memberIds.has(marker.id)),
    [allSites, memberIds],
  );
  const results = useMemo(
    () => searchEquipmentSites(allSites ?? [], query),
    [allSites, query],
  );
  const missingCodes = useMemo(
    () => findMissingCodes(allSites ?? [], query),
    [allSites, query],
  );
  // 화면에 그리는 범위 안에서, 아직 등록하지 않은 결과만 한 번에 고를 수 있다.
  const selectableResults = useMemo(
    () =>
      results
        .slice(0, RESULT_LIMIT)
        .filter((marker) => !memberIds.has(marker.id)),
    [results, memberIds],
  );
  const allResultsSelected =
    selectableResults.length > 0 &&
    selectableResults.every((marker) => toAdd.has(marker.id));

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const run = async (action: () => Promise<void>, done: string) => {
    if (!supabase) return;
    setIsBusy(true);
    try {
      await action();
      await refresh();
      toast({ description: done });
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      toast({ variant: "destructive", description: `저장 실패: ${message}` });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-[min(640px,95vw)] max-w-none flex-col gap-3 overflow-hidden border-slate-700 bg-slate-950 text-slate-100">
        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: list.color }}
            aria-hidden
          />
          {list.name}
        </DialogTitle>

        {canEdit ? (
          <section className="flex min-h-0 flex-1 flex-col gap-2">
            <label className="relative block">
              <span className="sr-only">추가할 국소 검색</span>
              <Search
                className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="국소명, 코드, 사업구분, 주소... (코드 여러 개를 붙여 넣어도 됩니다)"
                className="h-9 border-slate-700 bg-slate-900 pl-8 text-xs"
              />
            </label>
            {missingCodes.length > 0 ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-200">
                찾지 못한 코드 {missingCodes.length}개: {missingCodes.join(", ")}
              </p>
            ) : null}
            {selectableResults.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="h-8 shrink-0 border-slate-700 text-xs text-slate-200"
                disabled={isBusy}
                onClick={() =>
                  setToAdd((prev) => {
                    const everySelected = selectableResults.every((marker) =>
                      prev.has(marker.id),
                    );
                    const next = new Set(prev);
                    for (const marker of selectableResults) {
                      if (everySelected) next.delete(marker.id);
                      else next.add(marker.id);
                    }
                    return next;
                  })
                }
              >
                {allResultsSelected
                  ? "검색 결과 선택 해제"
                  : `검색 결과 ${selectableResults.length}건 모두 선택`}
              </Button>
            ) : null}
            {query.trim() ? (
              <div className="max-h-56 min-h-16 overflow-y-auto rounded-lg border border-slate-800">
                {results.length === 0 ? (
                  <p className="p-4 text-center text-xs text-slate-400">
                    일치하는 국소가 없습니다.
                  </p>
                ) : (
                  results.slice(0, RESULT_LIMIT).map((marker) => {
                    const isMember = memberIds.has(marker.id);
                    return (
                      <SiteRow
                        key={marker.id}
                        marker={marker}
                        checked={isMember || toAdd.has(marker.id)}
                        disabled={isMember}
                        note={isMember ? "등록됨" : undefined}
                        onToggle={() => setToAdd((prev) => toggle(prev, marker.id))}
                      />
                    );
                  })
                )}
                {results.length > RESULT_LIMIT ? (
                  <p className="p-2 text-center text-[11px] text-slate-400">
                    앞의 {RESULT_LIMIT}건만 표시합니다. 검색어를 좁혀 주세요.
                  </p>
                ) : null}
              </div>
            ) : null}
            <Button
              type="button"
              className="h-9 shrink-0 bg-indigo-600 text-xs hover:bg-indigo-500"
              disabled={isBusy || toAdd.size === 0}
              onClick={() =>
                void run(async () => {
                  await addSiteListMembers(supabase!, list.id, [...toAdd]);
                  setToAdd(new Set());
                }, `${toAdd.size}건을 목록에 추가했습니다.`)
              }
            >
              선택 {toAdd.size}건 추가
            </Button>
          </section>
        ) : (
          <p className="text-xs text-slate-400">
            관리자 목록은 관리자만 수정할 수 있습니다.
          </p>
        )}

        <section className="flex min-h-0 flex-1 flex-col gap-2">
          <h3 className="text-xs font-semibold text-slate-300">
            등록된 국소 {currentSites.length}건
          </h3>
          <div className="max-h-56 min-h-16 overflow-y-auto rounded-lg border border-slate-800">
            {currentSites.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-400">
                아직 등록된 국소가 없습니다.
              </p>
            ) : (
              currentSites.map((marker) => (
                <SiteRow
                  key={marker.id}
                  marker={marker}
                  checked={toRemove.has(marker.id)}
                  disabled={!canEdit}
                  onToggle={() => setToRemove((prev) => toggle(prev, marker.id))}
                />
              ))
            )}
          </div>
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0 border-rose-500/40 text-xs text-rose-300"
              disabled={isBusy || toRemove.size === 0}
              onClick={() =>
                void run(async () => {
                  await removeSiteListMembers(supabase!, list.id, [...toRemove]);
                  setToRemove(new Set());
                }, `${toRemove.size}건을 목록에서 뺐습니다. 장비 국소는 그대로 있습니다.`)
              }
            >
              선택 {toRemove.size}건 제외
            </Button>
          ) : null}
        </section>
      </DialogContent>
    </Dialog>
  );
}
