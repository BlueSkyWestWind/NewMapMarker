"use client";

import { ChevronLeft, ChevronRight, Lock, Search, X } from "lucide-react";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { PanelBody, type PanelBodyProps } from "@/features/shell/components/panel-body";
import { useShellNav } from "@/features/shell/hooks/use-shell-nav";
import {
  hasNavSegments,
  NAV_DESCRIPTIONS,
  SEGMENT_META,
  segmentsOfNav,
  showsMarkerSummary,
  subLabelOf,
} from "@/features/shell/lib/nav-model";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import { NAV_ITEMS } from "@/features/shell/types/nav";
import type { NavSubKey } from "@/features/shell/types/segment";

interface WorkPanelProps extends PanelBodyProps {
  /** 건수와 좌표 없음 안내. 상세 단계의 설명으로 쓴다. */
  countSummary: string;
  segmentCounts: Partial<Record<NavSubKey, number>>;
}

/** 드릴다운 패널. 첫 단계는 하위 메뉴 목록, 상세 단계는 기존 패널 내용이다. */
export function WorkPanel({ countSummary, segmentCounts, ...bodyProps }: WorkPanelProps) {
  const { activeNav, segment } = bodyProps;
  const { pickSegment, isSegmentLocked } = useShellNav();
  const toggleSidebar = useMapMarkerStore((state) => state.toggleSidebar);
  const markerListFilter = useMapMarkerStore((state) => state.markerListFilter);
  const setMarkerListFilter = useMapMarkerStore(
    (state) => state.setMarkerListFilter,
  );
  const isTreeOpen = useShellStore((state) => state.isTreeOpen);
  const panelStep = useShellStore((state) => state.panelStep);
  const setPanelStep = useShellStore((state) => state.setPanelStep);
  const scheduleSegment = useShellStore((state) => state.scheduleSegment);

  const hasSegments = hasNavSegments(activeNav);
  const isRoot = hasSegments && panelStep === "root";
  const navLabel = NAV_ITEMS.find((item) => item.key === activeNav)?.label ?? "";
  const title =
    hasSegments && !isRoot ? subLabelOf(activeNav, segment, scheduleSegment) : navLabel;
  const description = isRoot
    ? NAV_DESCRIPTIONS[activeNav]
    : showsMarkerSummary(activeNav, segment)
      ? countSummary
      : "";

  return (
    <aside
      /*
       * 1024px 미만에서는 지도가 너무 좁아진다 — 자리를 차지하는 대신 지도 위에 겹쳐 띄운다.
       * 폭 값은 셸이 CSS 변수로 내려 주므로 여기에 숫자를 적지 않는다.
       */
      className="flex h-full w-[var(--panel-w)] shrink-0 flex-col border-r border-slate-800 bg-slate-950/95 text-slate-100 max-lg:absolute max-lg:inset-y-0 max-lg:left-[var(--nav-w)] max-lg:z-30 max-lg:shadow-2xl"
      aria-label={title}
    >
      <header className="border-b border-slate-800 py-3 pl-7 pr-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 pt-1">
            {hasSegments && !isRoot && !isTreeOpen ? (
              <>
                <p className="flex items-center gap-1 text-xs font-semibold text-slate-400">
                  {navLabel}
                  <ChevronRight className="h-3 w-3" aria-hidden />
                </p>
                <button
                  type="button"
                  className="my-0.5 flex h-8 items-center gap-1 pr-2 text-xs font-semibold text-slate-300 hover:text-slate-100"
                  onClick={() => setPanelStep("root")}
                >
                  <ChevronLeft className="h-3 w-3" aria-hidden />
                  뒤로
                </button>
              </>
            ) : null}
            <h1 className="text-lg font-bold leading-tight">{title}</h1>
            {description ? (
              <p className="mt-1 text-xs leading-snug text-slate-400">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
            aria-label="패널 닫기"
            title="패널 닫기"
            onClick={toggleSidebar}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {isRoot ? (
          <label className="relative mr-1 mt-3 block">
            <span className="sr-only">이름·주소로 위치 찾기</span>
            <Search
              className="absolute left-3 top-3 h-4 w-4 text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              value={markerListFilter}
              onChange={(event) => setMarkerListFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                // 위치 찾기 목록이 있는 상세 단계로 간다. 변환기에는 목록이 없다.
                pickSegment(activeNav, segment === "converter" ? "equipment" : segment);
              }}
              placeholder="이름·주소로 위치 찾기..."
              className="h-10 w-full rounded-lg border border-slate-700 bg-slate-800 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-indigo-500"
            />
          </label>
        ) : null}
      </header>

      {isRoot ? (
        <div className="flex flex-col gap-0.5 p-2">
          {segmentsOfNav(activeNav).map((key) => {
            const { label, icon: Icon } = SEGMENT_META[key];
            const locked = isSegmentLocked(key);
            const count = segmentCounts[key];
            return (
              <button
                key={key}
                type="button"
                disabled={locked}
                title={locked ? "로그인 후 사용할 수 있습니다" : undefined}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => pickSegment(activeNav, key)}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 whitespace-nowrap">{label}</span>
                {locked ? <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                {count !== undefined ? (
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-bold">
                    {count}
                  </span>
                ) : null}
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <PanelBody {...bodyProps} />
        </div>
      )}
    </aside>
  );
}
