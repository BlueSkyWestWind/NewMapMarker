/**
 * 기상청 일일 호출 한도(가정값).
 * 실제 승인량은 공공데이터포털 마이페이지 / 기상청 API 허브 마이페이지에서 확인해 바꾼다.
 */
export const KMA_DAILY_LIMIT = 10000;

/** 사용률이 이 값 이상이면 관리자 화면에 경고를 띄운다. */
export const KMA_WARN_RATIO = 0.8;
