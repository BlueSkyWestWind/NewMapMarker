import type { AdminSession } from "../types";

/** 이 시간(분) 안에 활동이 있으면 "접속 중"으로 본다(토큰 갱신 주기가 약 1시간이라 여유를 둔다). */
const ACTIVE_WITHIN_MINUTES = 70;

/** User-Agent 글에서 브라우저/OS 이름을 뽑는다. 모르면 "알 수 없음". 순서가 중요하다(Edge·Whale 은 Chrome 도 포함). */
export function describeUserAgent(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (ua.trim() === "") return "알 수 없음";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Whale\//.test(ua)
      ? "Whale"
      : /OPR\/|Opera/.test(ua)
        ? "Opera"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "브라우저";
  // 안드로이드·iOS 는 Linux·Mac OS X 글도 포함하므로 먼저 본다.
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Macintosh|Mac OS X/.test(ua)
          ? "macOS"
          : /Linux|X11/.test(ua)
            ? "Linux"
            : "";
  return os === "" ? browser : `${browser}/${os}`;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** 오늘이면 `HH:mm`, 아니면 `MM-dd HH:mm`. */
export function formatLastActive(isoString: string, now: Date = new Date()): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "-";
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay ? time : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

export function isRecentlyActive(isoString: string, now: Date = new Date()): boolean {
  const time = new Date(isoString).getTime();
  if (Number.isNaN(time)) return false;
  return now.getTime() - time <= ACTIVE_WITHIN_MINUTES * 60_000;
}

/** `203.0.113.5 · Chrome/Windows · 마지막 활동 13:59` */
export function formatSessionLine(session: AdminSession, now: Date = new Date()): string {
  return [
    session.ip ?? "IP 없음",
    describeUserAgent(session.userAgent),
    `마지막 활동 ${formatLastActive(session.lastActiveAt, now)}`,
  ].join(" · ");
}

/** 마지막 활동이 최근인 순서로 정렬한 새 배열. */
export function sortSessionsByActivity(sessions: readonly AdminSession[]): AdminSession[] {
  return [...sessions].sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
}
