import type { MonthEntry, MonthTeam } from "@/features/schedule/lib/month-layout";

/**
 * 월간 보기에서 같은 날 목록이 완전히 같은 팀을 한 묶음으로 합친다(순수 함수).
 * 국소·모국 글과 입회·신호수 줄까지 포함해 순서와 상관없이 같을 때만 합치고, 하나라도 다르면 따로 둔다.
 * 엑셀 월간 배포 양식은 이 묶음을 쓰지 않고 팀별로 그대로 둔다.
 */
export interface MonthTeamGroup {
  /** 이 묶음에 든 팀들(팀 열 순서) */
  teams: MonthTeam[];
  /** 보여 줄 목록 = 묶음의 첫 팀의 목록(첫 팀의 순서) */
  entries: MonthEntry[];
}

const FIELD_SEPARATOR = "\u0001";
const ENTRY_SEPARATOR = "\u0002";

function signatureOf(entries: readonly MonthEntry[]): string {
  return entries
    .map((entry) => `${entry.mainText}${FIELD_SEPARATOR}${entry.subText}`)
    .sort()
    .join(ENTRY_SEPARATOR);
}

export function groupMonthTeams(teams: readonly MonthTeam[]): MonthTeamGroup[] {
  const groups = new Map<string, MonthTeamGroup>();
  for (const team of teams) {
    const key = signatureOf(team.entries);
    const group = groups.get(key);
    if (group) group.teams.push(team);
    else groups.set(key, { teams: [team], entries: team.entries });
  }
  return [...groups.values()];
}
