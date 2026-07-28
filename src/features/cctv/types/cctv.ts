/** CCTV 촬영 방향. 명칭에서 파싱한다(계획서 §5.3). */
export type CctvDirection = "상행" | "하행" | "방향지정" | "미상";

export interface CctvItem {
  /** ITS 응답에 안정적인 식별자가 없어 좌표+명칭으로 만든 키 */
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** ex(고속도로) | its(국도) */
  roadType: string;
  /** 도로구간 ID. 채워져 있으면 공간매칭 없이 쓸 수 있다(계획서 §5.3) */
  roadSectionId: string | null;
  direction: CctvDirection;
  /** "○○방향"으로 표기된 경우의 대상지명 */
  directionTarget: string | null;
  /** 영상 URL (스트리밍은 본 시스템 범위 외 — 참조용으로만 보관) */
  streamUrl: string | null;
}

/** 계획서 §10의 선결 확인 1·2번에 답하는 집계 */
export interface CctvSurvey {
  total: number;
  /** roadsectionid 필드 자체가 응답에 있었는지 */
  hasRoadSectionField: boolean;
  roadSectionFilled: number;
  roadSectionFilledPercent: number;
  /** §10.2 판정. 수집 0건이면 판정하지 않는다 — 없는 데이터로 단정하지 않기 위함 */
  roadSectionVerdict: "직접사용" | "부분활용" | "공간매칭필요" | "판정불가";
  /**
   * 응답에 실제로 들어 있던 필드명.
   * roadsectionid를 못 찾았을 때 "이름이 다른 것인지 진짜 없는 것인지"를 가리는 유일한 근거다.
   * (계획서 부록 A 스크립트의 `실제 필드 목록` 출력에 대응)
   */
  sampleFields: string[];

  directionUpDown: number;
  directionToward: number;
  directionArrow: number;
  directionNone: number;
  directionNonePercent: number;
  /** 방향정보 없음 30% 이상이면 수동 보정 화면이 필요하다(§10.2) */
  needsManualDirectionUi: boolean;
  /** "○○방향" 상위 표기 */
  topTowards: Array<{ word: string; count: number }>;

  byRoadType: Array<{ code: string; label: string; count: number }>;
}

export interface CctvResponse {
  /** 조회에 사용한 경계상자 */
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
  roadTypes: string[];
  items: CctvItem[];
  survey: CctvSurvey;
  /** 일부 도로종별 조회 실패 등 사용자 고지 사항 */
  warnings: string[];
  /** 경계상자가 사각형이라 대상 외 지역이 섞인다는 고지(계획서 §2.2) */
  notice: string;
}
