'use client';

import { useState, type KeyboardEvent } from 'react';
import { LogIn } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthSession } from '@/features/map-marker/hooks/use-auth-session';
import { useToast } from '@/hooks/use-toast';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// 라이트/다크 전환 증명용(Ver 2.1) — 하드코딩 slate 대신 세만틱 토큰을 쓴다.
const fieldClassName =
  'h-9 bg-secondary border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500';

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
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
        email,
        password,
      });
      if (error) {
        toast({ variant: 'destructive', description: error.message });
        return;
      }
      toast({ description: '로그인되었습니다.' });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleSignIn();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl p-6 [&_button.absolute]:hover:bg-accent [&_button.absolute]:hover:text-accent-foreground">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="text-lg font-bold">
            로그인
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label htmlFor="auth-email" className="text-xs text-muted-foreground">
              이메일
            </Label>
            <Input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="email"
              placeholder="name@example.com"
              className={fieldClassName}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="auth-password" className="text-xs text-muted-foreground">
              비밀번호
            </Label>
            <Input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="current-password"
              placeholder="••••••••"
              className={fieldClassName}
            />
          </div>
          <div className="pt-1">
            <Button
              type="button"
              className="h-9 w-full bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-500"
              disabled={isSubmitting}
              onClick={handleSignIn}
            >
              <LogIn className="mr-1.5 h-3.5 w-3.5" />
              로그인
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
