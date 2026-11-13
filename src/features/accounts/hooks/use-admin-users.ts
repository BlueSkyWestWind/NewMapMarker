"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import {
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  updateAdminUserRole,
} from "../api";
import type { CreateAccountInput } from "../types";

const ADMIN_USERS_QUERY_KEY = ["admin-users"] as const;

export function useAdminUsers() {
  const { session, user, isLoading: isAuthLoading } = useAuthSession();
  const token = session?.access_token;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ADMIN_USERS_QUERY_KEY,
    queryFn: () => fetchAdminUsers(token!),
    enabled: !!token,
    retry: false, // 오류 발생 시 지수 백오프로 뺑뺑이 돌지 않고 즉시 에러 표시
    staleTime: 30 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateAccountInput) => {
      if (!token) throw new Error("인증 토큰이 없습니다.");
      return createAdminUser(token, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      if (!token) throw new Error("인증 토큰이 없습니다.");
      return updateAdminUserRole(token, userId, isAdmin);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => {
      if (!token) throw new Error("인증 토큰이 없습니다.");
      return deleteAdminUser(token, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
    },
  });

  return {
    currentUserId: user?.id ?? null,
    users: query.data ?? [],
    isLoading: isAuthLoading || (!!token && query.isLoading),
    isRefetching: query.isRefetching,
    error: query.error ? (query.error as Error).message : null,
    refetch: query.refetch,
    createUser: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateRole: updateRoleMutation.mutateAsync,
    isUpdatingRole: updateRoleMutation.isPending,
    deleteUser: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
