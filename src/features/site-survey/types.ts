// 현장실사서 → 세부 시트 정리: 여러 파일이 함께 쓰는 공용 타입.

export type Direction = "below" | "right";

/** 실사서에서 값을 찾는 위치: 섹션 번호 + 라벨 글자 + 값이 있는 방향 */
export interface SourceRef {
  section: number;
  label: string;
  direction: Direction;
  nth?: number;
}

export type FieldId =
  | "year"
  | "project"
  | "facilityCode" // 식별 칸(항상 포함)
  | "facilityName"
  | "planName"
  | "method"
  | "round"
  | "workType"
  | "subType"
  | "bigCategory"
  | "midCategory"
  | "equipFinal"
  | "equipPlan"
  | "realty"
  | "equipPlace"
  | "towerType"
  | "towerSpec"
  | "address"
  | "aiManager" // 확실(16)
  | "antennaShape"
  | "sharer"
  | "region"
  | "regionDetail"
  | "mokuk"
  | "scanStation" // 규칙 변환(6)
  | "siteName" // 수기 메모 섞임(Site명, 기본 꺼짐)
  | "notes"; // 수기 메모 섞임(문제점 세부내역, 기본 꺼짐)

export type FieldGroup = "identity" | "sure" | "convert" | "mixed";

export type TransformId =
  | "copy"
  | "round"
  | "address"
  | "antenna"
  | "region"
  | "regionDetail"
  | "mokuk"
  | "scan"
  | "siteName"
  | "notes";

export interface Alias {
  from: string;
  to: string;
}

export interface RegionRule {
  prefix: string;
  region: string;
}

export type ModeRule =
  | { field: FieldId; kind: "fixed"; value: string }
  | { field: FieldId; kind: "source"; source: SourceRef };

/** 방식(원본 값)별 예외. useMokukOnly가 켜지면 모국(&기지국)에서 상위국명을 무시한다 */
export interface ModeRuleSet {
  mode: string;
  useMokukOnly: boolean;
  rules: ModeRule[];
}

export interface FieldSetting {
  enabled: boolean;
  aliases: Alias[];
  sources: Record<string, SourceRef>;
}

export interface StationSettings {
  stripTags: string[];
  cutTokens: string[];
  scanWords: string[];
  nonScanLabel: string;
}

export interface NotesSettings {
  includeEtc: boolean;
  includeAccess: boolean;
  includeBuilding: boolean;
  separator: string;
}

export interface SurveySettings {
  version: 1;
  fields: Record<FieldId, FieldSetting>;
  modeRules: ModeRuleSet[];
  /** 알려진 방식 목록. 밖의 값은 경고한다 */
  knownModes: string[];
  station: StationSettings;
  notes: NotesSettings;
  address: { appendBeonji: boolean; regionMap: RegionRule[] };
  antenna: { stripS: boolean };
}

/** 재귀 Partial. 배열은 합치지 않고 통째로 교체한다 */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** 기본값과 다른 부분만 담은 설정 */
export type SurveySettingsOverrides = DeepPartial<SurveySettings>;

export interface FieldRule {
  id: FieldId;
  column: number;
  group: FieldGroup;
  defaultEnabled: boolean;
  transform: TransformId;
  sources: Record<string, SourceRef>;
}

export interface NoteItem {
  section: number;
  label: string;
  value: string;
}

export interface SurveyIds {
  year: string;
  project: string;
  facilityCode: string;
}

export interface SurveyDoc {
  readonly fileName: string;
  /** 라벨이 없거나 값이 비면 "" */
  get(source: SourceRef): string;
  /** 라벨을 찾았는가(값이 비어도 true) */
  has(source: SourceRef): boolean;
  /** 본문의 `기타N`(문서 순서) */
  notes(): NoteItem[];
  ids(): SurveyIds;
}

export interface RowWarning {
  fileName: string;
  field: string;
  message: string;
}

export interface FieldResult {
  id: FieldId;
  column: number;
  raw: string;
  value: string;
  applied: "" | "mode-rule" | "alias";
}

export interface BuiltRow {
  fileName: string;
  cells: Record<number, string>;
  fields: FieldResult[];
  warnings: RowWarning[];
}
