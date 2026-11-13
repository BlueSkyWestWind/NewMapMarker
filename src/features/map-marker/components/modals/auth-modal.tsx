'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { MapPin } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthSession } from '@/lib/auth/use-auth-session';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AuthFormCardProps {
  onSuccess?: () => void;
  isModal?: boolean;
}

const SAVED_EMAIL_STORAGE_KEY = 'map-marker:saved-email';

export function AuthFormCard({ onSuccess, isModal = false }: AuthFormCardProps) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMode('login');
    setShowPassword(false);
    try {
      const saved = window.localStorage.getItem(SAVED_EMAIL_STORAGE_KEY);
      if (saved) {
        setEmail(saved);
        setRememberEmail(true);
      }
    } catch {
      // localStorage 접근 불가 환경 무시
    }
  }, []);

  const syncRememberedEmail = (nextEmail: string, remember: boolean) => {
    try {
      if (remember && nextEmail.trim()) {
        window.localStorage.setItem(SAVED_EMAIL_STORAGE_KEY, nextEmail.trim());
      } else if (!remember) {
        window.localStorage.removeItem(SAVED_EMAIL_STORAGE_KEY);
      }
    } catch {
      // localStorage 접근 불가 환경 무시
    }
  };

  const handleSignIn = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      toast({
        variant: 'destructive',
        description: '이메일과 비밀번호를 입력해 주세요.',
      });
      return;
    }
    if (!supabase) {
      toast({
        variant: 'destructive',
        description:
          'Supabase 연결 정보가 없습니다. 배포 환경 변수(NEXT_PUBLIC_SUPABASE_*)를 확인하세요.',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error) {
        toast({ variant: 'destructive', description: error.message });
        return;
      }
      syncRememberedEmail(trimmedEmail, rememberEmail);
      toast({ description: '로그인되었습니다.' });
      onSuccess?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast({
        variant: 'destructive',
        description: '재설정 링크를 받을 이메일을 입력해 주세요.',
      });
      return;
    }
    if (!supabase) {
      toast({
        variant: 'destructive',
        description:
          'Supabase 연결 정보가 없습니다. 배포 환경 변수(NEXT_PUBLIC_SUPABASE_*)를 확인하세요.',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      });
      if (error) {
        toast({ variant: 'destructive', description: error.message });
        return;
      }
      toast({
        description: '비밀번호 재설정 안내 메일을 발송했습니다. 메일함을 확인해 주세요.',
      });
      setMode('login');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (mode === 'login') {
        void handleSignIn();
      } else {
        void handleResetPassword();
      }
    }
  };

  const canSubmitLogin = email.trim().length > 0 && password.length > 0;
  const canSubmitReset = email.trim().length > 0;

  return (
    <div
      className={cn(
        'w-full max-w-[400px] rounded-2xl border border-slate-800 bg-slate-900 px-8 py-10 text-slate-100 shadow-2xl',
        isModal && 'border-0 bg-transparent p-0 shadow-none',
      )}
    >
      <div className="flex flex-col items-center space-y-2 text-center">
        <div className="flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md">
            <MapPin className="h-5 w-5" aria-hidden />
          </div>
          {isModal ? (
            <DialogTitle className="text-2xl font-semibold tracking-tight text-slate-100">
              MapMarker
            </DialogTitle>
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
              MapMarker
            </h1>
          )}
        </div>
        {isModal ? (
          <DialogDescription className="text-xs leading-relaxed text-slate-400">
            {mode === 'login'
              ? '지도 마커 및 시설 통합 관리 시스템'
              : '가입한 이메일로 비밀번호 재설정 링크를 보냅니다'}
          </DialogDescription>
        ) : (
          <p className="text-xs leading-relaxed text-slate-400">
            {mode === 'login'
              ? '지도 마커 및 시설 통합 관리 시스템'
              : '가입한 이메일로 비밀번호 재설정 링크를 보냅니다'}
          </p>
        )}
      </div>

      {mode === 'login' ? (
        <div className="mt-6 space-y-3.5">
          <div>
            <label htmlFor="auth-email" className="sr-only">
              이메일
            </label>
            <Input
              id="auth-email"
              type="email"
              aria-label="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="email"
              placeholder="아이디 또는 이메일"
              className="h-12 rounded-lg border-slate-700/90 bg-slate-950/70 px-4 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500"
            />
          </div>

          <div className="relative">
            <label htmlFor="auth-password" className="sr-only">
              비밀번호
            </label>
            <Input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              aria-label="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="current-password"
              placeholder="비밀번호"
              className="h-12 rounded-lg border-slate-700/90 bg-slate-950/70 pl-4 pr-14 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-sm px-1.5 py-1 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200"
            >
              {showPassword ? '숨김' : '표기'}
            </button>
          </div>

          <div className="flex items-center pt-1">
            <button
              type="button"
              role="switch"
              aria-checked={rememberEmail}
              onClick={() => {
                const next = !rememberEmail;
                setRememberEmail(next);
                syncRememberedEmail(email, next);
              }}
              className="group flex items-center gap-2.5 text-xs text-slate-300 focus-visible:outline-none"
            >
              <span
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                  rememberEmail ? 'bg-indigo-600' : 'bg-slate-700',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                    rememberEmail ? 'translate-x-4' : 'translate-x-0.5',
                  )}
                />
              </span>
              <span className="font-medium text-slate-300 group-hover:text-slate-100">
                아이디 기억하기
              </span>
            </button>
          </div>

          <div className="pt-3">
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleSignIn}
              className={cn(
                'h-12 w-full rounded-lg text-sm font-semibold transition-colors',
                canSubmitLogin
                  ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
              )}
            >
              {isSubmitting ? '로그인 중...' : '로그인'}
            </Button>
          </div>

          <div className="flex items-center justify-center pt-2 text-xs text-slate-400">
            <button
              type="button"
              onClick={() => setMode('reset')}
              className="transition-colors hover:text-slate-200 hover:underline"
            >
              비밀번호 재설정
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="auth-reset-email" className="sr-only">
              이메일
            </label>
            <Input
              id="auth-reset-email"
              type="email"
              aria-label="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="email"
              placeholder="가입한 이메일 주소"
              className="h-12 rounded-lg border-slate-700/90 bg-slate-950/70 px-4 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500"
            />
          </div>

          <Button
            type="button"
            disabled={isSubmitting}
            onClick={handleResetPassword}
            className={cn(
              'h-12 w-full rounded-lg text-sm font-semibold transition-colors',
              canSubmitReset
                ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
            )}
          >
            {isSubmitting ? '발송 중...' : '재설정 메일 보내기'}
          </Button>

          <div className="flex items-center justify-center pt-1 text-xs text-slate-400">
            <button
              type="button"
              onClick={() => setMode('login')}
              className="transition-colors hover:text-slate-200 hover:underline"
            >
              로그인으로 돌아가기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-[400px] rounded-2xl border border-slate-800 bg-slate-900 px-8 py-10 text-slate-100 shadow-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>MapMarker 로그인</DialogTitle>
        </DialogHeader>
        <AuthFormCard isModal onSuccess={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
