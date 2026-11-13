// 칸 규칙표: 세부 시트의 어떤 열을 실사서의 어느 라벨에서 어떻게 만드는지(기본값).
// 관리자 설정(`default-settings.ts`)이 이 표 위에 덮어쓴다.

import type { Direction, FieldGroup, FieldId, FieldRule, SourceRef, TransformId } from "../types";

function src(section: number, label: string, direction: Direction): SourceRef {
  return { section, label, direction };
}

function rule(
  id: FieldId,
  column: number,
  group: FieldGroup,
  transform: TransformId,
  sources: Record<string, SourceRef>,
  defaultEnabled = true,
): FieldRule {
  return { id, column, group, defaultEnabled, transform, sources };
}

export const FIELD_RULES: readonly FieldRule[] = [
  // 식별 칸 (항상 포함)
  rule("year", 0, "identity", "copy", { main: src(1, "사업년도", "below") }),
  rule("project", 1, "identity", "copy", { main: src(1, "프로젝트 코드", "right") }),
  rule("facilityCode", 2, "identity", "copy", { main: src(1, "통합시설코드", "right") }),

  // 확실 (그대로, 기본 켜짐)
  rule("facilityName", 7, "sure", "copy", { main: src(1, "확정국소명", "below") }),
  rule("planName", 8, "sure", "copy", { main: src(1, "계획단계국소명", "below") }),
  rule("method", 9, "sure", "copy", { main: src(1, "방식", "below") }),
  rule("round", 10, "sure", "round", {
    round: src(1, "사업차수", "below"),
    year: src(1, "사업년도", "below"),
  }),
  rule("workType", 12, "sure", "copy", { main: src(1, "세부공사유형", "below") }),
  rule("subType", 13, "sure", "copy", { main: src(1, "세부사업구분", "below") }),
  rule("bigCategory", 14, "sure", "copy", { main: src(1, "투자목적 대분류", "right") }),
  rule("midCategory", 15, "sure", "copy", { main: src(1, "투자목적 중분류", "right") }),
  rule("equipFinal", 18, "sure", "copy", { main: src(1, "장비Type(변경)", "below") }),
  rule("equipPlan", 20, "sure", "copy", { main: src(1, "장비Type(계획)", "below") }),
  rule("realty", 51, "sure", "copy", { main: src(3, "장소구분", "below") }),
  rule("equipPlace", 53, "sure", "copy", { main: src(3, "시설장소", "below") }),
  rule("towerType", 57, "sure", "copy", { main: src(5, "철탑형태", "below") }),
  rule("towerSpec", 58, "sure", "copy", { main: src(5, "철탑높이", "below") }),
  rule("address", 60, "sure", "address", {
    oldAddress: src(2, "구주소", "below"),
    lot: src(2, "구 세부주소 (번지)", "below"),
  }),
  rule("aiManager", 75, "sure", "copy", { main: src(1, "승인담당자", "below") }),

  // 규칙 변환 (기본 켜짐)
  rule("antennaShape", 59, "convert", "antenna", { main: src(5, "공중선방식", "below") }),
  rule("sharer", 55, "convert", "copy", { main: src(2, "공용화주관사", "below") }),
  rule("region", 5, "convert", "region", { oldAddress: src(2, "구주소", "below") }),
  rule("regionDetail", 6, "convert", "regionDetail", { oldAddress: src(2, "구주소", "below") }),
  rule("mokuk", 24, "convert", "mokuk", {
    mokukName: src(4, "모국명", "below"),
    upperName: src(4, "(LTE)전송로 상위국명", "below"),
  }),
  rule("scanStation", 25, "convert", "scan", { mokukName: src(4, "모국명", "below") }),

  // 수기 메모와 섞이는 칸 (기본 꺼짐)
  rule("siteName", 72, "mixed", "siteName", { facilityName: src(1, "확정국소명", "below") }, false),
  rule("notes", 50, "mixed", "notes", {}, false),
];

export const FIELD_BY_ID: Record<FieldId, FieldRule> = Object.fromEntries(
  FIELD_RULES.map((r) => [r.id, r]),
) as Record<FieldId, FieldRule>;
