import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SQL_PATH = join(process.cwd(), "supabase", "migrations", "20261119000000_login_history.sql");

/** 주석을 뺀 SQL 본문(주석 속 예시 문구가 검사에 걸리지 않게 한다). */
function loadSql(): string {
  return readFileSync(SQL_PATH, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

describe("접속기록 마이그레이션 SQL", () => {
  it("테이블과 인덱스 2개를 만든다", () => {
    const sql = loadSql();
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.login_history");
    expect(sql).toContain("login_history_user_occurred_idx");
    expect(sql).toContain("login_history_occurred_idx");
  });

  it("action은 login·logout만 허용한다", () => {
    expect(loadSql()).toContain("CHECK (action IN ('login', 'logout'))");
  });

  it("외래키가 없다(계정 삭제 후에도 기록 유지)", () => {
    expect(loadSql()).not.toMatch(/REFERENCES/i);
  });

  it("RLS는 관리자 SELECT 정책만 둔다", () => {
    const sql = loadSql();
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("login_history_select_admin");
    expect(sql).toContain("is_app_admin()");
    expect(sql).not.toMatch(/FOR\s+(INSERT|UPDATE|DELETE|ALL)/i);
  });

  it("트리거 함수는 SECURITY DEFINER·빈 search_path·예외 삼킴이다", () => {
    const sql = loadSql();
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain("EXCEPTION WHEN OTHERS");
  });

  it("auth.sessions의 INSERT·DELETE에 트리거를 건다", () => {
    const sql = loadSql();
    expect(sql).toContain("AFTER INSERT OR DELETE ON auth.sessions");
    expect(sql).toContain("on_auth_session_login_history");
  });

  it("백필은 같은 세션의 login 행이 있으면 건너뛴다(멱등)", () => {
    const sql = loadSql();
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toMatch(/h\.session_id\s*=\s*s\.id/);
    expect(sql).toMatch(/h\.action\s*=\s*'login'/);
  });

  it("1년이 지난 기록을 지우는 cron을 등록한다", () => {
    const sql = loadSql();
    expect(sql).toContain("login-history-cleanup");
    expect(sql).toContain("interval '1 year'");
  });
});
