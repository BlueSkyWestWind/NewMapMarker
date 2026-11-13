// 칸 값 변환 함수들. 모두 순수 함수이고 설정은 인자로 받는다.

import type { Alias, RegionRule } from "../types";

/** `5차` + 사업년도 `2026` → `26-05`. 차수 모양이 아니면 그대로 */
export function formatRound(round: string, year: string): string {
  const m = /^(\d+)차$/.exec(round.trim());
  const yy = year.trim().slice(-2);
  if (!m || yy.length !== 2) return round;
  return `${yy}-${m[1].padStart(2, "0")}`;
}

/** `{구주소} {번지}번지`. 번지가 이미 `번지`로 끝나면 다시 붙이지 않는다 */
export function formatAddress(oldAddress: string, lot: string, appendBeonji: boolean): string {
  const base = oldAddress.trim();
  const bunji = lot.trim();
  if (!bunji) return base;
  const tail = appendBeonji && !bunji.endsWith("번지") ? `${bunji}번지` : bunji;
  return `${base} ${tail}`;
}

/** 숫자 뒤의 `S` 제거 (`1S`→`1`) */
export function stripTrailingS(raw: string, enabled: boolean): string {
  if (!enabled) return raw;
  const m = /^(\d+)S$/.exec(raw.trim());
  return m ? m[1] : raw;
}

/** 주소가 prefix로 시작하는 첫 규칙의 지역. 없으면 "" */
export function regionOf(address: string, map: RegionRule[]): string {
  const text = address.trim();
  const hit = map.find((r) => r.prefix && text.startsWith(r.prefix));
  return hit ? hit.region : "";
}

/** 주소의 둘째 단어 */
export function regionDetailOf(address: string): string {
  return address.trim().split(/\s+/)[1] ?? "";
}

const SITE_TAGS = ["(공동)", "(도서)", "(단독)"];
// `_N-AAU*` `-RRU(…)` `_DBRRU…` `-GIR*(…)` `-PRU(…)` `-LORA` `-DU*` 같은 꼬리(끝의 `_이` 포함)를 통째로 지운다
const SITE_TAIL = /[_-](?:\d+-)?(?:AAU|DBRRU|RRU|GIR|PRU|LORA|DU)[\s\S]*$/;

/** Site명: 앞 태그와 꼬리 장비 토큰을 지운다. 동·층 표기는 건드리지 않는다 */
export function siteNameOf(facilityName: string): string {
  let name = facilityName.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const tag of SITE_TAGS) {
      if (name.startsWith(tag)) {
        name = name.slice(tag.length).trimStart();
        changed = true;
      }
    }
  }
  return name.replace(SITE_TAIL, "").trim();
}

/** 빈 조각을 빼고 구분자로 잇는다 */
export function joinParts(parts: string[], separator: string): string {
  return parts.filter((p) => p !== "").join(separator);
}

/** 글자가 정확히 같을 때만 바꾼다(앞뒤 공백 무시). 같은 from이면 먼저 나온 것 */
export function applyAliases(value: string, aliases: Alias[]): string {
  const key = value.trim();
  const hit = aliases.find((a) => a.from.trim() === key);
  return hit ? hit.to : value;
}
