import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

/**
 * 서버 전용 Supabase Admin Client.
 * SUPABASE_SERVICE_ROLE_KEY를 사용하여 auth.admin 및 RLS 우회 조작을 수행한다.
 * 절대 클라이언트 브라우저 환경에서 호출해서는 안 된다.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 환경 변수가 설정되지 않았습니다. Supabase 대시보드(Project Settings > API > service_role)에서 시크릿 키를 복사하여 .env.local에 추가해 주세요.",
    );
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}

/**
 * 서버에서 일반 토큰을 검증할 때 사용하는 클라이언트.
 */
export function getSupabaseServerAnonClient(): SupabaseClient {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  if (!url || !anonKey) {
    throw new Error("SUPABASE_ANON_KEY 환경 변수가 설정되지 않았습니다.");
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
