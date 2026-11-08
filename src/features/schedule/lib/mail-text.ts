/**
 * 일일일정(일자별) 행으로 업무 메일에 붙여 넣는 텍스트를 만든다(순수 함수).
 *
 *   [2026-11-09 시설일정]
 *   1팀(박경훈),4팀(이동화)
 *      -> [주간] [입회 : 박민수] [신호수 : 정창오] [중장비 : 이동식크레인] 국소명 (작업내용 상세)
 *
 * 같은 팀 묶음의 국소를 한 단락으로 묶고, 비어 있는 항목은 뺀다.
 */

export interface MailRow {
  site: string;
  /** `1팀(박경훈)`처럼 이 국소를 맡은 팀들. 직접 추가한 행처럼 팀이 없으면 빈 배열 */
  teams: readonly string[];
  values: {
    workTime: string;
    witness: string;
    signaler: string;
    equipment: string;
    workDetail: string;
  };
}

const NO_TEAM_LABEL = "팀 미지정";

function lineOf(row: MailRow): string {
  const { workTime, witness, signaler, equipment, workDetail } = row.values;
  const parts: string[] = [];
  if (workTime.trim() !== "") parts.push(`[${workTime.trim()}]`);
  if (witness.trim() !== "") parts.push(`[입회 : ${witness.trim()}]`);
  if (signaler.trim() !== "") parts.push(`[신호수 : ${signaler.trim()}]`);
  if (equipment.trim() !== "") parts.push(`[중장비 : ${equipment.trim()}]`);
  parts.push(row.site);
  if (workDetail.trim() !== "") parts.push(`(${workDetail.trim()})`);
  return `   -> ${parts.join(" ")}`;
}

export function buildMailText(workDate: string, rows: readonly MailRow[]): string {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const heading = row.teams.length > 0 ? row.teams.join(",") : NO_TEAM_LABEL;
    const lines = groups.get(heading) ?? [];
    lines.push(lineOf(row));
    groups.set(heading, lines);
  }
  const sections = [...groups].map(([heading, lines]) => [heading, ...lines].join("\n"));
  return [`[${workDate} 시설일정]`, ...(sections.length > 0 ? [sections.join("\n\n")] : [])].join("\n");
}
