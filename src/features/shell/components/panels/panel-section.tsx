"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface PanelSectionProps {
  icon?: LucideIcon;
  title: string;
  iconClassName?: string;
  children: ReactNode;
}

/**
 * 패널 안의 카드 한 칸. 아코디언을 걷어낸 자리를 대신한다.
 *
 * 메뉴가 최상위가 되면서 한 패널에 남는 섹션 수가 줄었다. 두세 개짜리 목록을
 * 접었다 펴게 하면 매번 한 번 더 눌러야 한다 — 그래서 펼친 카드로 둔다.
 */
export function PanelSection({
  icon: Icon,
  title,
  iconClassName,
  children,
}: PanelSectionProps) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-200">
        {Icon ? <Icon className={iconClassName ?? "h-3.5 w-3.5 text-slate-400"} aria-hidden /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}
