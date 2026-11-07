import { OPTION_LIST_KEYS, type OptionListKey, type OptionLists } from "./day-types";

/**
 * 드롭다운 목록의 처음 값. 출처: 통합 문서1.xlsx `List` 시트(사업분류 D · 사업유형 E ·
 * 공사유형 F · 작업구분 G · 작업유형 U · 중장비투입 V · 작업내용 W, 3~19행) + 작업시간.
 * 중장비투입의 쉼표 조합(`이동식크레인,굴착기`)은 항목 하나다.
 * 마이그레이션의 INSERT 값과 같아야 한다.
 */
export const OPTION_LIST_SEEDS: OptionLists = {
  bizClass: [
    "기지국",
    "중계기",
    "인빌딩",
    "지하철",
    "CATV",
    "택지",
    "SKT선로",
    "SKB선로",
    "통합국사",
    "공통설비",
    "IDC",
    "발전소",
    "충전소",
  ],
  bizKind: ["WCDMA", "LoRa", "기타", "5G", "Wi-Fi", "LTE"],
  constructionType: ["철거", "이설", "대개체", "신설", "증설"],
  workCategory: [
    "HW",
    "사업관리",
    "접속",
    "관로",
    "관리",
    "행정",
    "실사",
    "외선",
    "치국",
    "시험",
    "SPEED",
    "측량",
  ],
  workTime: ["주간", "야간"],
  workType: [
    "고소(옥상/옥탑)작업",
    "고소(철탑/전주)작업",
    "실외",
    "실내",
    "철탑 설치/철거",
    "전주 설치/철거",
    "치국/현장실사",
    "사업관리/민원",
    "지하철/터널",
  ],
  equipment: [
    "이동식크레인",
    "고소작업대(차)",
    "고소작업대(시저형)",
    "굴착기",
    "롤러",
    "펌프트럭",
    "믹서트럭",
    "덤프트럭",
    "지게차",
    "사다리차",
    "이동식크레인,굴착기",
    "이동식크레인,고소작업대(차)",
    "이동식크레인,굴착기,고소작업대(차)",
    "이동식크레인,굴착기,펌프트럭,믹서트럭",
    "이동식크레인,굴착기,믹서트럭",
    "펌프트럭,믹서트럭",
    "승주",
  ],
  workContent: [
    "RACK 설치/철거",
    "장비철거",
    "장비설치",
    "장비시험",
    "부대장비 설치/철거",
    "DU로딩",
    "기타",
  ],
};

/** 목록 8개를 새 객체·새 배열로 복사한다. 돌려받은 쪽이 바꿔도 원본(처음 값 상수)이 오염되지 않는다. */
export function cloneOptionLists(lists: OptionLists): OptionLists {
  return Object.fromEntries(
    OPTION_LIST_KEYS.map((key) => [key, [...lists[key]]]),
  ) as unknown as OptionLists;
}

export const OPTION_LIST_LABELS: Record<OptionListKey, string> = {
  bizClass: "사업분류",
  bizKind: "사업유형",
  constructionType: "공사유형",
  workCategory: "작업구분",
  workTime: "작업시간",
  workType: "작업유형",
  equipment: "중장비투입",
  workContent: "작업내용",
};
