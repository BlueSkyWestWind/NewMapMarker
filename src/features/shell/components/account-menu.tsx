"use client";

import { UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AuthHeader } from "@/features/map-marker/components/sidebar/auth-header";

/** 아이콘 레일의 계정 메뉴. 잠긴 메뉴를 숨기므로 로그인 진입점이 반드시 보여야 한다. */
export function AccountMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-14 w-full items-center justify-center border-t border-slate-800 text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label="계정 및 로그아웃"
          title="계정 및 로그아웃"
        >
          <UserRound className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="end"
        className="border-slate-700 bg-slate-900 p-2 text-slate-200"
      >
        <AuthHeader />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
