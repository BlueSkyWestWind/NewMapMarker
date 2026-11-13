"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreateAccountInput } from "../types";

interface AccountCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateAccountInput) => Promise<void>;
  isLoading: boolean;
}

export function AccountCreateDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: AccountCreateDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setPasswordConfirm("");
    setIsAdmin(false);
    setErrorMessage(null);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("이메일을 입력해 주세요.");
      return;
    }
    if (!trimmedEmail.includes("@")) {
      setErrorMessage("올바른 이메일 주소를 입력해 주세요.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("비밀번호는 최소 6자리 이상이어야 합니다.");
      return;
    }
    if (password !== passwordConfirm) {
      setErrorMessage("비밀번호가 일치하지 않습니다.");
      return;
    }

    try {
      await onSubmit({
        email: trimmedEmail,
        password,
        isAdmin,
      });
      handleClose(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "계정 생성 중 오류가 발생했습니다.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="border-slate-800 bg-slate-900 text-slate-100 sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-100">
              신규 계정 추가
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              추가된 계정은 이메일 인증 절차 없이 즉시 로그인할 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3.5 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="account-email" className="text-xs text-slate-300">
                이메일 <span className="text-rose-400">*</span>
              </Label>
              <Input
                id="account-email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
                className="h-9 border-slate-700 bg-slate-950 text-slate-100 text-sm focus-visible:ring-indigo-500"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="account-password" className="text-xs text-slate-300">
                비밀번호 (6자 이상) <span className="text-rose-400">*</span>
              </Label>
              <Input
                id="account-password"
                type="password"
                placeholder="******"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
                className="h-9 border-slate-700 bg-slate-950 text-slate-100 text-sm focus-visible:ring-indigo-500"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="account-password-confirm" className="text-xs text-slate-300">
                비밀번호 확인 <span className="text-rose-400">*</span>
              </Label>
              <Input
                id="account-password-confirm"
                type="password"
                placeholder="******"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                disabled={isLoading}
                required
                className="h-9 border-slate-700 bg-slate-950 text-slate-100 text-sm focus-visible:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="account-is-admin"
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                disabled={isLoading}
                className="h-4 w-4 rounded-sm border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
              />
              <Label htmlFor="account-is-admin" className="cursor-pointer text-xs font-normal text-slate-200">
                관리자 권한 부여 (국소 수정, 계정 관리 등 관리자 권한 활성화)
              </Label>
            </div>

            {errorMessage && (
              <p className="rounded-sm bg-rose-950/60 p-2 text-xs text-rose-300 border border-rose-800/50">
                {errorMessage}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleClose(false)}
              disabled={isLoading}
              className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            >
              취소
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isLoading}
              className="bg-indigo-600 text-white hover:bg-indigo-500"
            >
              {isLoading ? "생성 중..." : "계정 생성"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
