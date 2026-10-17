"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/features/map-marker/components/modals/auth-modal";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useHasMounted } from "@/hooks/use-has-mounted";

/**
 * 지도 하단 중앙 안내. 마커는 로그인해야 보이므로, 비로그인 상태의 빈 지도가
 * 고장처럼 보이지 않게 이유와 로그인 진입점을 함께 준다.
 *
 * 세션 복원이 끝나기 전에는 띄우지 않는다 — 로그인 상태인데 안내가 깜빡이는 걸 막는다.
 */
export function LoginRequiredNotice() {
  const hasMounted = useHasMounted();
  const { isAuthenticated, isLoading } = useAuthSession();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  if (!hasMounted || isLoading || isAuthenticated) return null;

  return (
    <>
      <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-md border border-slate-700 bg-slate-950/90 px-3 py-2 text-[12px] text-slate-200 shadow-lg">
        <span>로그인하면 마커가 표시됩니다</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 border-indigo-500/40 bg-indigo-500/10 px-2 text-[11px] text-indigo-200"
          onClick={() => setIsAuthModalOpen(true)}
        >
          <LogIn className="mr-1 h-3 w-3" />
          로그인
        </Button>
      </div>
      <AuthModal open={isAuthModalOpen} onOpenChange={setIsAuthModalOpen} />
    </>
  );
}
