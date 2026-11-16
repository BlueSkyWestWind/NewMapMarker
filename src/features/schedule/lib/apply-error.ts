export type ApplyFailure = "stale" | "missing-function" | "other";

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return String(error);
}

function extractCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

/**
 * `apply_schedule_groups` RPC 호출 오류를 충돌(stale)·함수 없음·기타로 분류한다.
 */
export function classifyApplyError(error: unknown): { kind: ApplyFailure; message: string } {
  const message = extractMessage(error);
  const code = extractCode(error);

  if (message.includes("stale_group")) {
    return { kind: "stale", message };
  }

  if (
    code === "PGRST202" ||
    code === "42883" ||
    message.includes("Could not find the function")
  ) {
    return { kind: "missing-function", message };
  }

  return { kind: "other", message };
}
