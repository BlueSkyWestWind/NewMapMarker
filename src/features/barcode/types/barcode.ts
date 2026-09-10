/** 사진 대조 라이트박스가 여는 대상. */
export interface LightboxTarget {
  photoUrl: string;
  value: string;
}

/** 재고 엑셀 한 행. `text`는 전체 셀을 이어붙인 소문자 문자열(검색용)이다. */
export interface LookupRow {
  text: string;
  cells: Record<string, string>;
}
