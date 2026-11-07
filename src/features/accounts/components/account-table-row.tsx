"use client";

import { Shield, ShieldAlert, Trash2 } from "lucide-react";
import { formatAccountDateTime } from "../lib/account-helpers";
import type { AdminUser } from "../types";

interface AccountTableRowProps {
  user: AdminUser;
  index: number;
  isCurrent: boolean;
  onToggleRole: (userId: string, nextIsAdmin: boolean) => void;
  onDelete: (user: AdminUser) => void;
  disabled?: boolean;
}

export function AccountTableRow({
  user,
  index,
  isCurrent,
  onToggleRole,
  onDelete,
  disabled = false,
}: AccountTableRowProps) {
  return (
    <tr className="border-b border-slate-800 text-xs text-slate-200 transition-colors hover:bg-slate-800/40">
      {/* 번호 */}
      <td className="whitespace-nowrap px-3 py-2.5 text-center text-slate-400">
        {index}
      </td>

      {/* 이메일 */}
      <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-100">
        <div className="flex items-center gap-1.5">
          <span>{user.email}</span>
          {isCurrent && (
            <span className="rounded bg-sky-950 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400 border border-sky-800/60">
              나
            </span>
          )}
        </div>
      </td>

      {/* 가입일 */}
      <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">
        {formatAccountDateTime(user.createdAt)}
      </td>

      {/* 최근 로그인 */}
      <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">
        {formatAccountDateTime(user.lastSignInAt)}
      </td>

      {/* 관리자 권한 토글 */}
      <td className="whitespace-nowrap px-3 py-2.5">
        <div className="flex items-center gap-2">
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={user.isAdmin}
              onChange={(e) => onToggleRole(user.id, e.target.checked)}
              disabled={disabled || isCurrent}
              aria-label={`${user.email} 관리자 권한 토글`}
              className="peer sr-only"
            />
            <div
              className={`h-4 w-7 rounded-full bg-slate-700 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-3 after:w-3 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-3 peer-focus:outline-none ${
                disabled || isCurrent ? "cursor-not-allowed opacity-50" : ""
              }`}
            />
          </label>
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-medium ${
              user.isAdmin ? "text-indigo-400" : "text-slate-400"
            }`}
          >
            {user.isAdmin ? (
              <>
                <Shield className="h-3 w-3" />
                관리자
              </>
            ) : (
              "일반"
            )}
          </span>
        </div>
      </td>

      {/* 관리 (삭제 버튼) */}
      <td className="whitespace-nowrap px-3 py-2.5 text-center">
        <button
          type="button"
          onClick={() => onDelete(user)}
          disabled={disabled || isCurrent}
          title={isCurrent ? "본인 계정은 삭제할 수 없습니다" : "계정 삭제"}
          aria-label={`${user.email} 삭제`}
          className={`inline-flex items-center justify-center rounded p-1 text-slate-400 transition-colors hover:bg-rose-950/50 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500 ${
            disabled || isCurrent ? "cursor-not-allowed opacity-30 hover:bg-transparent hover:text-slate-400" : ""
          }`}
        >
          {isCurrent ? (
            <ShieldAlert className="h-3.5 w-3.5 text-slate-500" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </td>
    </tr>
  );
}
