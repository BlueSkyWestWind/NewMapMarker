import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 우리 서버 `/api/*` 호출용 fetch. 로그인 세션의 access token을 Bearer로 실어 보낸다.
 *
 * 서버 라우트는 이 헤더로만 로그인 여부를 안다(세션이 쿠키가 아니라 localStorage에 있다).
 * 세션이 없으면 헤더 없이 보내 서버가 401로 응답하게 둔다.
 * **외부 도메인 호출에는 쓰지 않는다** — 사용자 토큰이 제3자에게 넘어간다.
 */
export async function authedFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}
