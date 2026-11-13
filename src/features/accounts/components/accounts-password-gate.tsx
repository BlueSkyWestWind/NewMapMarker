"use client";

import { useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";

interface AccountsPasswordGateProps {
  /** 비밀번호가 맞으면 호출한다 */
  onVerified: () => void;
}

/**
 * 계정설정에 들어가기 전 비밀번호 확인. 지금 로그인한 계정의 이메일과 입력한 비밀번호로 다시 로그인해 본다.
 * 계정설정 화면을 벗어나면(언마운트) 다음 진입 때 다시 묻는다.
 */
export function AccountsPasswordGate({ onVerified }: AccountsPasswordGateProps) {
  const { supabase, user } = useAuthSession();
  const [password, setPassword] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isChecking || password === "") return;
    if (!supabase || !user?.email) {
      setMessage("로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.");
      return;
    }
    setIsChecking(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (error) {
        setMessage("비밀번호가 맞지 않습니다.");
        setPassword("");
        return;
      }
      onVerified();
    } catch {
      setMessage("확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950 p-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-2xl"
      >
        <div className="flex items-center gap-2 text-slate-100">
          <Lock className="h-4 w-4" aria-hidden />
          <h2 className="text-base font-semibold">계정설정</h2>
        </div>
        <p className="text-xs text-slate-400">
          계정을 관리하려면 현재 로그인한 계정({user?.email ?? "-"})의 비밀번호를 입력하세요.
        </p>
        <Input
          type="password"
          value={password}
          autoFocus
          autoComplete="current-password"
          aria-label="비밀번호"
          placeholder="비밀번호"
          disabled={isChecking}
          onChange={(event) => setPassword(event.target.value)}
          className="h-9 border-slate-700 bg-slate-900 text-sm"
        />
        {message ? <p className="text-xs text-rose-400">{message}</p> : null}
        <Button
          type="submit"
          disabled={isChecking || password === ""}
          className="h-9 bg-indigo-600 text-sm hover:bg-indigo-500"
        >
          {isChecking ? "확인 중…" : "확인"}
        </Button>
      </form>
    </div>
  );
}
