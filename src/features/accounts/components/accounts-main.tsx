"use client";

import { useState } from "react";
import { AccountsPasswordGate } from "./accounts-password-gate";
import { AccountsPanel } from "./accounts-panel";

/**
 * 계정설정 메인 화면.
 * 들어갈 때마다 비밀번호를 확인한다(화면을 벗어나면 다시 묻는다).
 * 지도를 숨기고 화면 전체(최대 1100px)를 활용하여 계정 목록과 관리 기능을 렌더링한다.
 */
export function AccountsMain() {
  const [isVerified, setVerified] = useState(false);
  if (!isVerified) return <AccountsPasswordGate onVerified={() => setVerified(true)} />;
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-slate-950 p-3 sm:p-6 overflow-hidden">
      <div className="mx-auto w-full max-w-5xl flex-1 flex flex-col rounded-xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        <AccountsPanel />
      </div>
    </div>
  );
}
