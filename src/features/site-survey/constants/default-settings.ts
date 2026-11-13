// 환경설정 기본값. 관리자가 바꾼 부분만 DB에 저장하고, 나머지는 이 값을 따른다.

import type { Alias, FieldId, FieldSetting, SurveySettings } from "../types";
import { FIELD_RULES } from "./survey-fields";

const ALIASES: Partial<Record<FieldId, Alias[]>> = {
  sharer: [{ from: "LGT", to: "LGU+" }],
  method: [{ from: "인빌딩", to: "광분산" }],
  midCategory: [{ from: "NW구조혁신", to: "NW슬림화" }],
};

function buildFields(): Record<FieldId, FieldSetting> {
  const entries = FIELD_RULES.map((r) => [
    r.id,
    { enabled: r.defaultEnabled, aliases: ALIASES[r.id] ?? [], sources: {} } satisfies FieldSetting,
  ]);
  return Object.fromEntries(entries) as Record<FieldId, FieldSetting>;
}

export const DEFAULT_SETTINGS: SurveySettings = {
  version: 1,
  fields: buildFields(),
  modeRules: [
    {
      mode: "인빌딩",
      useMokukOnly: true,
      // 철탑 규격·공중선 형상 `1`은 근거가 약해(47%·53%) 넣지 않는다(설계 §4.4)
      rules: [
        { field: "towerType", kind: "fixed", value: "인빌딩" },
        { field: "equipPlace", kind: "source", source: { section: 2, label: "장비설치 층", direction: "below" } },
      ],
    },
  ],
  knownModes: ["광중계기", "광분산", "기지국", "터널", "인빌딩"],
  station: {
    stripTags: ["(공동)", "(도서)"],
    cutTokens: ["-##_", "_", ".55."],
    scanWords: ["집중국", "통합국", "중심국", "전송실"],
    nonScanLabel: "비SCAN",
  },
  notes: { includeEtc: true, includeAccess: true, includeBuilding: true, separator: "/" },
  address: {
    appendBeonji: true,
    regionMap: [
      { prefix: "전남광주통합특별시", region: "전남" },
      { prefix: "광주", region: "전남" },
      { prefix: "전남", region: "전남" },
      { prefix: "전북", region: "전북" },
      { prefix: "제주시", region: "제주" },
      { prefix: "서귀포시", region: "제주" },
      { prefix: "제주", region: "제주" },
    ],
  },
  antenna: { stripS: true },
};
