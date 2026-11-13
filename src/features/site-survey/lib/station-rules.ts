// 모국(&기지국)·집중국 규칙. 설정(StationSettings)만 보고 결정하는 순수 함수.

import type { StationSettings } from "../types";

/** 자르는 구분 문자열을 정규식으로 바꾼다. `#`은 숫자 한 자리 */
function cutPattern(token: string): RegExp {
  const source = token
    .split("")
    .map((ch) => (ch === "#" ? "\\d" : ch.replace(/[.*+?^${}()|[\]\\\-]/g, "\\$&")))
    .join("");
  return new RegExp(source);
}

/** 이름 다듬기: 앞 태그를 모두 지우고, 구분 문자열 중 가장 먼저 나오는 곳 앞까지만 남긴다 */
export function cleanStationName(raw: string, station: StationSettings): string {
  let name = raw.trim();
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const tag of station.stripTags) {
      if (tag && name.startsWith(tag)) {
        name = name.slice(tag.length).trimStart();
        stripped = true;
      }
    }
  }
  let cutAt = name.length;
  for (const token of station.cutTokens) {
    if (!token) continue;
    const m = cutPattern(token).exec(name);
    if (m && m.index < cutAt) cutAt = m.index;
  }
  return name.slice(0, cutAt).trim();
}

export function isScanStation(cleaned: string, station: StationSettings): boolean {
  return station.scanWords.some((word) => word && cleaned.includes(word));
}

export function deriveStations(
  input: { mokukName: string; upperName: string; useMokukOnly: boolean },
  station: StationSettings,
): { mokuk: string; concentrator: string } {
  const mokukName = cleanStationName(input.mokukName, station);
  const upperName = cleanStationName(input.upperName, station);
  const mokuk = input.useMokukOnly ? mokukName : upperName || mokukName;
  // 모국명을 못 읽었으면 집중국도 만들지 않는다(없는 값을 `비SCAN`으로 지어내지 않는다)
  const concentrator =
    mokukName === "" ? "" : isScanStation(mokukName, station) ? mokukName : station.nonScanLabel;
  return { mokuk, concentrator };
}
