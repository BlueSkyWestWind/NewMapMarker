import type { DayColumnKey, OptionListKey } from "@/features/schedule/lib/day-types";

/**
 * 일자별 상세표의 24열 정의(스펙 14.4, 엑셀 A~X 순서).
 * - auto: 일정에서 자동으로 나온다(작업자·입회자·신호수는 행에서 고칠 수 있다).
 * - ref: 공정관리·누적·마커에서 가져오고 직접 덮어쓸 수 있다.
 * - input: 사용자가 입력한다(기본값이 있는 열도 있다).
 */
export interface DayColumn {
  key: DayColumnKey;
  header: string;
  /** 엑셀 열 문자(A~X) */
  letter: string;
  /** 엑셀 열 폭(문자 수 단위) */
  widthChars: number;
  kind: "auto" | "ref" | "input";
  /** 드롭다운 목록 이름 */
  list?: OptionListKey;
}

export const DAY_COLUMNS: readonly DayColumn[] = [
  { key: "seq", header: "순번", letter: "A", widthChars: 6, kind: "auto" },
  { key: "project", header: "프로젝트", letter: "B", widthChars: 17, kind: "ref" },
  { key: "facilityCode", header: "통합시설코드", letter: "C", widthChars: 16, kind: "ref" },
  { key: "bizClass", header: "사업분류", letter: "D", widthChars: 10, kind: "ref", list: "bizClass" },
  { key: "bizKind", header: "사업유형", letter: "E", widthChars: 10, kind: "ref", list: "bizKind" },
  { key: "constructionType", header: "공사유형", letter: "F", widthChars: 10, kind: "ref", list: "constructionType" },
  { key: "workCategory", header: "작업구분", letter: "G", widthChars: 10, kind: "input", list: "workCategory" },
  { key: "region", header: "지역", letter: "H", widthChars: 14, kind: "ref" },
  { key: "site", header: "국소명", letter: "I", widthChars: 45.875, kind: "auto" },
  { key: "equipType", header: "장비타입", letter: "J", widthChars: 33.875, kind: "ref" },
  { key: "workDate", header: "작업일", letter: "K", widthChars: 9, kind: "auto" },
  { key: "address", header: "주소", letter: "L", widthChars: 45.625, kind: "ref" },
  { key: "motherStation", header: "모국", letter: "M", widthChars: 26, kind: "ref" },
  { key: "worker", header: "작업자", letter: "N", widthChars: 14, kind: "auto" },
  { key: "witness", header: "입회자", letter: "O", widthChars: 14, kind: "auto" },
  { key: "signaler", header: "신호수", letter: "P", widthChars: 14, kind: "auto" },
  { key: "realtyType", header: "부동산형태", letter: "Q", widthChars: 12, kind: "ref" },
  { key: "equipLocation", header: "장비위치", letter: "R", widthChars: 14, kind: "ref" },
  { key: "levelLabel", header: "작업구분", letter: "S", widthChars: 10, kind: "input" },
  { key: "workTime", header: "작업시간", letter: "T", widthChars: 10, kind: "input", list: "workTime" },
  { key: "workType", header: "작업유형", letter: "U", widthChars: 14, kind: "input", list: "workType" },
  { key: "equipment", header: "중장비투입", letter: "V", widthChars: 22, kind: "input", list: "equipment" },
  { key: "workContent", header: "작업내용", letter: "W", widthChars: 14, kind: "input", list: "workContent" },
  { key: "workDetail", header: "작업내용 상세", letter: "X", widthChars: 25.125, kind: "input" },
];
