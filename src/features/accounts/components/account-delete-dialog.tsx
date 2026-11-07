"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdminUser } from "../types";

interface AccountDeleteDialogProps {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (userId: string) => Promise<void>;
  isLoading: boolean;
}

export function AccountDeleteDialog({
  user,
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: AccountDeleteDialogProps) {
  if (!user) return null;

  const handleDelete = async () => {
    try {
      await onConfirm(user.id);
      onOpenChange(false);
    } catch {
      // 오류는 상위 훅/토스트에서 처리
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-900 text-slate-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-rose-400">
            계정 영구 삭제
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-300">
            정말로 <span className="font-semibold text-slate-100">{user.email}</span> 계정을 삭제하시겠습니까?
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 text-xs text-slate-400 space-y-1.5">
          <p className="rounded bg-rose-950/40 p-2.5 border border-rose-900/40 text-rose-300">
            ⚠️ 계정을 삭제하면 로그인할 수 없으며, 부여된 관리자 권한도 함께 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-100"
          >
            취소
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isLoading}
            className="bg-rose-600 text-white hover:bg-rose-500"
          >
            {isLoading ? "삭제 중..." : "영구 삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
