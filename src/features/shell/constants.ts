/**
 * 셸 레이아웃 폭. **여기가 단일 소스다.**
 *
 * 이전에는 340이 사이드바·CCTV 모달·캡처 패널 세 곳에 각각 박혀 있어
 * 한 곳만 고치면 모달이 지도 중앙에서 어긋났다. 픽셀 계산이 필요한 쪽은
 * Tailwind 임의값 대신 이 상수를 import 한다.
 */
export const NAV_RAIL_WIDTH_PX = 56;
/** 펼친 트리의 폭. 트리는 레일을 대신한다. */
export const NAV_TREE_WIDTH_PX = 256;
/** 변환 결과·건축물대장 표가 340에서는 답답해 380으로 넓혔다. */
export const WORK_PANEL_WIDTH_PX = 380;
/** 그룹관리 관리 창 최대 폭. 표 열이 다 보이도록 넓게 잡는다(가로 스크롤 금지). */
export const GROUP_MANAGE_DIALOG_MAX_WIDTH_PX = 1680;
/** 관리 창 왼쪽 묶음 목록 폭. */
export const GROUP_MANAGE_LIST_WIDTH_PX = 260;
/** 그룹관리 일괄 수정 창 최대 폭. */
export const GROUP_BULK_DIALOG_MAX_WIDTH_PX = 880;
/** 일정 수정(칸 편집) 창 최대 폭. 국소 목록·입회신호수·함께 등록할 팀을 한 화면에 보이려고 넓혔다. */
export const SCHEDULE_CELL_DIALOG_MAX_WIDTH_PX = 1024;
/** 일정표의 날짜 열 폭. 공휴일 이름·작업금지 배지가 줄바꿈 없이 보이도록 넉넉하게 잡는다. */
export const SCHEDULE_DATE_COLUMN_WIDTH_PX = 150;

/**
 * 지도 영역의 좌측 오프셋. **뷰포트 고정(`position: fixed`) 요소만** 이 값이 필요하다.
 * 지도 컨테이너 안에서 `absolute`로 뜨는 요소는 이미 지도 기준이라 더하면 안 된다.
 */
export function mapLeftOffsetPx(params: {
  isMobile: boolean;
  isTreeOpen: boolean;
  isPanelOpen: boolean;
}): number {
  // 모바일은 왼쪽 메뉴 없이 지도가 화면 전체를 쓴다.
  if (params.isMobile) return 0;
  const nav = params.isTreeOpen ? NAV_TREE_WIDTH_PX : NAV_RAIL_WIDTH_PX;
  return nav + (params.isPanelOpen ? WORK_PANEL_WIDTH_PX : 0);
}
