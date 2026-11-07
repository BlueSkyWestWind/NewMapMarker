import type { SupabaseBrowserClient } from "@/lib/supabase/client";

/** `app_admins`에 행이 있으면 관리자다. 조회 오류는 호출부가 처리하도록 던진다. */
export async function fetchIsAppAdmin(
  supabase: SupabaseBrowserClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("app_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
