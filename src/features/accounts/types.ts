/** 로그인 세션 하나(Supabase `auth.sessions`). 관리자 전용 API 로만 내려온다. */
export interface AdminSession {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActiveAt: string;
}

/** 로그인·로그아웃 이벤트 하나(`public.login_history`). logout 행의 IP·브라우저는 세션이 만들어질 때의 값이다. */
export interface LoginEvent {
  at: string;
  action: "login" | "logout";
  ip: string | null;
  userAgent?: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  isAdmin: boolean;
  /** 접속 중인 세션들. 조회 함수(마이그레이션)가 없으면 `undefined` */
  sessions?: AdminSession[];
}

export interface CreateAccountInput {
  email: string;
  password: string;
  isAdmin?: boolean;
}
