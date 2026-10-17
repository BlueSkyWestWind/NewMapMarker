import { createClient } from "@supabase/supabase-js";

export type AuthCheck =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 500 | 503; error: string };

const UNAUTHORIZED: AuthCheck = {
  ok: false,
  status: 401,
  error: "로그인이 필요합니다.",
};

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

/** 일시 장애(네트워크·Supabase 5xx)인가. 로그인 문제로 오인하지 않기 위해 구분한다. */
function isTransientAuthError(error: { name?: string; status?: number }): boolean {
  if (error.name === "AuthRetryableFetchError") return true;
  return typeof error.status === "number" && error.status >= 500;
}

/**
 * `Authorization: Bearer <access_token>`을 Supabase `auth.getUser`로 검증한다.
 *
 * 세션은 쿠키가 아니라 브라우저 localStorage에 있어 서버는 이 헤더로만 로그인 여부를 안다.
 * 서버 env가 없으면 **열지 않고** 500으로 닫는다(검증이 꺼진 채 통과하는 일을 막는다).
 */
export async function verifyAuthToken(request: Request): Promise<AuthCheck> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !anonKey) {
    return {
      ok: false,
      status: 500,
      error: "서버에 Supabase 설정이 없어 로그인을 확인할 수 없습니다.",
    };
  }

  const match = BEARER_PATTERN.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1]?.trim();
  if (!token) return UNAUTHORIZED;

  try {
    // 요청 간 상태를 공유하지 않도록 호출마다 만든다.
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      if (isTransientAuthError(error)) {
        return {
          ok: false,
          status: 503,
          error: "로그인 확인 서버에 일시적으로 연결하지 못했습니다.",
        };
      }
      return UNAUTHORIZED;
    }
    if (!data.user) return UNAUTHORIZED;
    return { ok: true, userId: data.user.id };
  } catch {
    return {
      ok: false,
      status: 503,
      error: "로그인 확인 서버에 일시적으로 연결하지 못했습니다.",
    };
  }
}
