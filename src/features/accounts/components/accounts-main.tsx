"use client";

import { AccountsPanel } from "./accounts-panel";

/**
 * 계정설정 메인 화면.
 * 지도를 숨기고 화면 전체(최대 1100px)를 활용하여 계정 목록과 관리 기능을 렌더링한다.
 */
export function AccountsMain() {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-slate-950 p-3 sm:p-6 overflow-hidden">
      <div className="mx-auto w-full max-w-5xl flex-1 flex flex-col rounded-xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        <AccountsPanel />
      </div>
    </div>
  );
}
