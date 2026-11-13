"use client";

import { listsOfMarker } from "@/features/site-lists/lib/site-list-view";
import { useSiteLists } from "@/features/site-lists/hooks/use-site-lists";

/** 상세 화면의 전체 소속 목록. 소속이 없으면 그리지 않는다. */
export function SiteListMembership({ markerId }: { markerId: string }) {
  const { lists, members } = useSiteLists();
  const memberships = listsOfMarker(markerId, lists, members);
  if (memberships.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-slate-800/80 bg-slate-900/40 px-4 py-2.5">
      <p className="mb-1.5 text-xs font-semibold text-slate-300">소속 목록</p>
      <ul className="flex flex-wrap gap-1.5">
        {memberships.map((list) => (
          <li
            key={list.id}
            className="flex items-center gap-1.5 rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: list.color }}
              aria-hidden
            />
            {list.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
