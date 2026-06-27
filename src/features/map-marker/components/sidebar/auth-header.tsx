'use client';

import { useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthSession } from '@/features/map-marker/hooks/use-auth-session';
import { AuthModal } from '@/features/map-marker/components/modals/auth-modal';

export function AuthHeader() {
  const { user, supabase } = useAuthSession();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {user ? (
          <>
            <span
              className="max-w-[90px] truncate text-[11px] text-slate-400"
              title={user.email ?? ''}
            >
              {user.email}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-rose-400 hover:text-rose-300"
              onClick={handleLogout}
              title="로그아웃"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 border-indigo-500/40 bg-indigo-500/10 px-2 text-[11px] text-indigo-200"
            onClick={() => setIsAuthModalOpen(true)}
          >
            <LogIn className="mr-1 h-3 w-3" />
            로그인 / 가입
          </Button>
        )}
      </div>
      <AuthModal open={isAuthModalOpen} onOpenChange={setIsAuthModalOpen} />
    </>
  );
}
