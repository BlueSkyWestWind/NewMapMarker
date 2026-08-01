"use client";

import { Construction } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description?: string;
}

/**
 * 미구현 메뉴 안내. 가짜 버튼이나 목업 데이터를 넣지 않는다 —
 * 눌리는 것처럼 보이면 고장으로 오해한다.
 */
export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center">
      <Construction className="h-6 w-6 text-slate-500" aria-hidden />
      <p className="text-xs font-semibold text-slate-300">{title}</p>
      <p className="text-[11px] leading-relaxed text-slate-500">
        {description ?? "준비 중입니다."}
      </p>
    </div>
  );
}
