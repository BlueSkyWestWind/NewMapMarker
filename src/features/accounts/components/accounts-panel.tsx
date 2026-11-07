"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminUsers } from "../hooks/use-admin-users";
import { isCurrentUser } from "../lib/account-helpers";
import type { AdminUser, CreateAccountInput } from "../types";
import { AccountCreateDialog } from "./account-create-dialog";
import { AccountDeleteDialog } from "./account-delete-dialog";
import { AccountTableRow } from "./account-table-row";

export function AccountsPanel() {
  const {
    currentUserId,
    users,
    isLoading,
    isRefetching,
    error,
    refetch,
    createUser,
    isCreating,
    updateRole,
    isUpdatingRole,
    deleteUser,
    isDeleting,
  } = useAdminUsers();

  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const filteredUsers = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) return users;
    return users.filter((u) => u.email.toLowerCase().includes(trimmed));
  }, [users, searchQuery]);

  const handleCreateSubmit = async (input: CreateAccountInput) => {
    try {
      await createUser(input);
      setStatusMessage({ text: "새 계정이 생성되었습니다.", type: "success" });
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err) {
      throw err;
    }
  };

  const handleToggleRole = async (userId: string, nextIsAdmin: boolean) => {
    try {
      await updateRole({ userId, isAdmin: nextIsAdmin });
      setStatusMessage({
        text: nextIsAdmin ? "관리자 권한이 부여되었습니다." : "관리자 권한이 해제되었습니다.",
        type: "success",
      });
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err) {
      setStatusMessage({
        text: err instanceof Error ? err.message : "권한 변경에 실패했습니다.",
        type: "error",
      });
      setTimeout(() => setStatusMessage(null), 3500);
    }
  };

  const handleDeleteConfirm = async (userId: string) => {
    try {
      await deleteUser(userId);
      setStatusMessage({ text: "계정이 삭제되었습니다.", type: "success" });
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err) {
      setStatusMessage({
        text: err instanceof Error ? err.message : "계정 삭제에 실패했습니다.",
        type: "error",
      });
      setTimeout(() => setStatusMessage(null), 3500);
      throw err;
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      {/* 상단 툴바 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 p-3 sm:px-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-100">계정설정</h2>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
            총 {users.length}명
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="h-8 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
            title="새로고침"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="h-8 gap-1 bg-indigo-600 px-2.5 text-xs text-white hover:bg-indigo-500"
          >
            <Plus className="h-3.5 w-3.5" />
            계정 추가
          </Button>
        </div>
      </div>

      {/* 상태 알림 바 */}
      {statusMessage && (
        <div
          className={`px-4 py-2 text-xs font-medium border-b ${
            statusMessage.type === "success"
              ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/40"
              : "bg-rose-950/60 text-rose-300 border-rose-800/40"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* 검색 입력창 */}
      <div className="border-b border-slate-800/60 p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <Input
            type="text"
            placeholder="이메일 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus-visible:ring-indigo-500"
          />
        </div>
      </div>

      {/* 계정 목록 표 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            <span className="text-xs">계정 목록을 불러오는 중...</span>
          </div>
        ) : error ? (
          <div className="m-4 rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 text-xs text-amber-200">
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <span>⚠️ 데이터베이스 연결 설정 필요</span>
            </div>
            <p className="mt-2 text-slate-300">
              Supabase 사용자 계정 관리(목록 조회·생성·삭제)는 보안 정책상 관리자 전용 시크릿 키가 필요합니다.
            </p>
            <div className="mt-3 rounded bg-slate-950/80 p-3 font-mono text-[11px] text-slate-300 border border-slate-800 space-y-1.5">
              <p className="text-slate-400 font-sans font-medium">설정 방법:</p>
              <p>1. Supabase 대시보드 → Project Settings → API 로 이동합니다.</p>
              <p>2. 화면에 표시된 <span className="text-amber-400">SUPABASE_SECRET_KEY</span> (또는 service_role) 값을 복사합니다.</p>
              <p>3. 로컬 프로젝트의 <span className="text-indigo-400">.env.local</span> 파일에 아래와 같이 추가합니다:</p>
              <div className="rounded bg-slate-900 p-2 text-indigo-300 select-all">
                SUPABASE_SECRET_KEY=&lt;복사한_sb_secret_키&gt;
              </div>
              <p className="text-slate-400">4. 추가 후 개발 서버(npm run dev)를 재시작하고 상단의 [새로고침]을 누르세요.</p>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              상세 오류: {error}
            </p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            {searchQuery ? "검색 조건에 맞는 계정이 없습니다." : "등록된 계정이 없습니다."}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-950/90 backdrop-blur border-b border-slate-800 text-[11px] font-medium text-slate-400">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-center w-12">No</th>
                <th className="whitespace-nowrap px-3 py-2">이메일</th>
                <th className="whitespace-nowrap px-3 py-2 w-36">가입일</th>
                <th className="whitespace-nowrap px-3 py-2 w-36">최근 로그인</th>
                <th className="whitespace-nowrap px-3 py-2 w-28">권한</th>
                <th className="whitespace-nowrap px-3 py-2 text-center w-14">관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user, idx) => (
                <AccountTableRow
                  key={user.id}
                  user={user}
                  index={idx + 1}
                  isCurrent={isCurrentUser(currentUserId, user.id)}
                  onToggleRole={handleToggleRole}
                  onDelete={(target) => setDeleteTarget(target)}
                  disabled={isUpdatingRole || isDeleting}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 신규 계정 추가 모달 */}
      <AccountCreateDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSubmit={handleCreateSubmit}
        isLoading={isCreating}
      />

      {/* 계정 삭제 확인 모달 */}
      <AccountDeleteDialog
        user={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
      />
    </div>
  );
}
