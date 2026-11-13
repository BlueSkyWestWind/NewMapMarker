"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import { loadSurveySettings, saveSurveySettings, type SaveResult } from "../api";
import { DEFAULT_SETTINGS } from "../constants/default-settings";
import { mergeSettings } from "../lib/settings-schema";
import type { SurveySettings, SurveySettingsOverrides } from "../types";

export interface UseSurveySettings {
  /** status가 ok가 아니면 DEFAULT_SETTINGS */
  settings: SurveySettings;
  overrides: SurveySettingsOverrides;
  updatedAt: string | null;
  status: "loading" | "ok" | "missing-table" | "invalid";
  errors: string[];
  isAdmin: boolean;
  isSaving: boolean;
  save(overrides: SurveySettingsOverrides): Promise<SaveResult>;
}

export function useSurveySettings(): UseSurveySettings {
  const { supabase, user } = useAuthSession();
  const { isAdmin } = useIsAdmin();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const queryKey = useMemo(() => ["survey-settings", userId] as const, [userId]);
  const [isSaving, setIsSaving] = useState(false);

  const query = useQuery({
    queryKey,
    queryFn: () => loadSurveySettings(supabase!),
    enabled: !!supabase && !!userId,
    retry: false,
  });

  const save = useCallback(
    async (overrides: SurveySettingsOverrides): Promise<SaveResult> => {
      if (!supabase || !userId) return { status: "denied" };
      setIsSaving(true);
      try {
        const loaded = query.data;
        const expected = loaded?.status === "ok" ? loaded.updatedAt : null;
        const result = await saveSurveySettings(supabase, overrides, expected, userId);
        if (result.status === "saved") await queryClient.invalidateQueries({ queryKey });
        return result;
      } finally {
        setIsSaving(false);
      }
    },
    [supabase, userId, query.data, queryClient, queryKey],
  );

  const data = query.data;
  const overrides: SurveySettingsOverrides = data?.status === "ok" ? data.overrides : {};
  const settings = useMemo(
    () => (data?.status === "ok" ? mergeSettings(DEFAULT_SETTINGS, data.overrides) : DEFAULT_SETTINGS),
    [data],
  );

  return {
    settings,
    overrides,
    updatedAt: data?.status === "ok" ? data.updatedAt : null,
    status: !data ? "loading" : data.status,
    errors: data?.status === "invalid" ? data.errors : [],
    isAdmin,
    isSaving,
    save,
  };
}
