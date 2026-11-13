// 현장실사서 환경설정(survey_settings 1행) 읽기·쓰기.
// 수정은 관리자만: 화면 숨김만 믿지 않고 DB 정책(public.is_app_admin())이 직접 막는다.

import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { parseOverrides } from "./lib/settings-schema";
import type { SurveySettingsOverrides } from "./types";

const TABLE = "survey_settings";
const ROW_ID = "default";

export type LoadResult =
  | { status: "ok"; overrides: SurveySettingsOverrides; updatedAt: string | null }
  | { status: "missing-table" }
  | { status: "invalid"; errors: string[] };

export type SaveResult =
  | { status: "saved"; updatedAt: string }
  | { status: "conflict" }
  | { status: "denied" }
  | { status: "missing-table" };

interface DbError {
  code?: string;
  message?: string;
}

/** 42P01 = undefined_table, PGRST205 = PostgREST 스키마 캐시에 테이블 없음 */
function isTableMissing(error: DbError): boolean {
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return (error.message ?? "").includes(TABLE) && /does not exist|Could not find/i.test(error.message ?? "");
}

async function readRow(supabase: SupabaseBrowserClient) {
  return supabase.from(TABLE).select("settings, updated_at").eq("id", ROW_ID).maybeSingle();
}

export async function loadSurveySettings(supabase: SupabaseBrowserClient): Promise<LoadResult> {
  const { data, error } = await readRow(supabase);
  if (error) {
    if (isTableMissing(error)) return { status: "missing-table" };
    throw error;
  }
  if (!data) return { status: "ok", overrides: {}, updatedAt: null };
  const parsed = parseOverrides(data.settings);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors };
  return { status: "ok", overrides: parsed.overrides, updatedAt: data.updated_at as string };
}

/**
 * expectedUpdatedAt이 null이면 처음 저장(insert), 아니면 불러온 updated_at과 같은 행만 갱신한다.
 * 0행이면 다른 관리자가 먼저 저장했거나(conflict) 권한이 없는 것(denied)이라 현재 값을 다시 읽어 구분한다.
 */
export async function saveSurveySettings(
  supabase: SupabaseBrowserClient,
  overrides: SurveySettingsOverrides,
  expectedUpdatedAt: string | null,
  userId: string,
): Promise<SaveResult> {
  if (expectedUpdatedAt === null) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({ id: ROW_ID, settings: overrides, updated_by: userId })
      .select("updated_at")
      .single();
    if (error) {
      if (error.code === "23505") return { status: "conflict" };
      if (error.code === "42501") return { status: "denied" };
      if (isTableMissing(error)) return { status: "missing-table" };
      throw error;
    }
    return { status: "saved", updatedAt: data.updated_at as string };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update({ settings: overrides, updated_by: userId })
    .eq("id", ROW_ID)
    .eq("updated_at", expectedUpdatedAt)
    .select("updated_at");
  if (error) {
    if (error.code === "42501") return { status: "denied" };
    if (isTableMissing(error)) return { status: "missing-table" };
    throw error;
  }
  if (data && data.length > 0) return { status: "saved", updatedAt: data[0].updated_at as string };

  const current = await readRow(supabase);
  if (current.error) {
    if (isTableMissing(current.error)) return { status: "missing-table" };
    throw current.error;
  }
  if (!current.data || current.data.updated_at !== expectedUpdatedAt) return { status: "conflict" };
  return { status: "denied" };
}
