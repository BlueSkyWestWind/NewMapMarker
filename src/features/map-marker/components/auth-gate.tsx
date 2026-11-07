"use client";

import type { ReactNode } from "react";
import { AuthFormCard } from "@/features/map-marker/components/modals/auth-modal";
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
        <AuthFormCard />
      </div>
    );
  }

  return <>{children}</>;
}
