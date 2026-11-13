// 세부 시트(`세부_26년`) A~CB 80열의 머리글. 결과 엑셀의 열 순서가 이 순서와 같아야 한다.

export interface DetailColumn {
  index: number;
  letter: string;
  header: string;
}

/** 0 기준 열 번호를 Excel 열 이름으로 (0→A, 26→AA, 79→CB) */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

const HEADERS: readonly string[] = [
  "연도",
  "프로젝트",
  "통합시설코드",
  "관리항목",
  "협력사",
  "지역 구분",
  "지역 세부",
  "국소명-최종",
  "국소명-계획",
  "방식",
  "사업 차수",
  "사업 구분",
  "사업 유형",
  "세부사업 유형",
  "사업구분 대분류",
  "사업구분 중분류",
  "부대증설유형",
  "장비최종 대분류",
  "장비최종",
  "장비계획 대분류",
  "장비계획",
  "시트 발행",
  "SID 발행",
  "긴급대응",
  "모국 (&기지국)",
  "집중국",
  "인허가 대상",
  "인허가증 발행",
  "회선 업체명",
  "회선구성 방법",
  "청약 요청번호",
  "회선 청약일",
  "전송로 ENG승인",
  "회선개통 (날짜만)",
  "전기 업체",
  "전기 개통",
  "전주건식 필요여부",
  "전주건식 완료일",
  "공중선 공사",
  "장비 공사",
  "시험 완료",
  "ACTA 시험조정일",
  "ERP 활용구분",
  "ACTA 구축완료일",
  "선로 계획",
  "전기 계획",
  "H/W 계획",
  "시험 계획",
  "문제점1",
  "문제점2",
  "문제점 세부내역 및 대책방안",
  "부동산 형태",
  "건물유형",
  "장비위치",
  "공용화 단독/공용",
  "공용화 주관사",
  "참여사 3사,SKT,KT LGU+,단독",
  "철탑 형태",
  "철탑 규격",
  "공중선 형상",
  "주소(전체)",
  "출입방법",
  "대상여부(대상,불필요)",
  "수령일",
  "특이사항 (현장특이사항 및 불필요사유)",
  "공가 신청",
  "공가 승인",
  "착공계제출 (BP->한전)",
  "준공계제출 (BP->한전)",
  "해지공가 요청",
  "해지공가 승인",
  "특이사항",
  "Site명",
  "HW팀",
  "시험팀",
  "AI담당",
  "릴리즈구분",
  "불완전 치국대상",
  "사전설계 대상여부",
  "사전설계 완료일",
];

export const DETAIL_COLUMNS: readonly DetailColumn[] = HEADERS.map((header, index) => ({
  index,
  letter: columnLetter(index),
  header,
}));
