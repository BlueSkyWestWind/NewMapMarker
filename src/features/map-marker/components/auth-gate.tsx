"use client";

import { useState, type ReactNode } from "react";
import { Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/features/map-marker/components/modals/auth-modal";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useHasMounted } from "@/hooks/use-has-mounted";

/**
 * 앱 전체의 로그인 벽. 로그인하기 전에는 children(지도·CCTV·마커 등)을 마운트하지 않는다.
 * 그래서 비로그인 방문자에게는 카카오 SDK 로드·마커 조회·ITS 호출이 일어나지 않는다.
 *
 * 세션이 쿠키가 아니라 localStorage에 있어 서버는 로그인 여부를 모른다 — 잠금은 여기서만 한다.
 * 서버 API는 별도로 Bearer 토큰을 검증한다(`guardProxyRequest`).
 *
 * 서버 HTML과 클라이언트 첫 렌더는 둘 다 로딩 분기라 하이드레이션이 어긋나지 않는다.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const hasMounted = useHasMounted();
  const { isAuthenticated, isLoading } = useAuthSession();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  if (!hasMounted || isLoading) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-slate-950 text-sm text-slate-400">
        불러오는 중...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800">
            <Lock className="h-6 w-6 text-slate-400" />
          </div>
          <h1 className="text-base font-bold">로그인이 필요합니다</h1>
          <p className="text-[13px] leading-relaxed text-slate-400">
            지도와 CCTV는 로그인한 사용자만 이용할 수 있습니다.
          </p>
          <Button
            type="button"
            className="mt-1 h-9 gap-1.5 bg-indigo-600 px-4 text-[13px] text-white hover:bg-indigo-500"
            onClick={() => setIsAuthModalOpen(true)}
          >
            <LogIn className="h-4 w-4" />
            로그인
          </Button>
        </div>
        <AuthModal open={isAuthModalOpen} onOpenChange={setIsAuthModalOpen} />
      </div>
    );
  }

  return <>{children}</>;
}
