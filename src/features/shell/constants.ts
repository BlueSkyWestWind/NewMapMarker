/**
 * 셸 레이아웃 폭. **여기가 단일 소스다.**
 *
 * 이전에는 340이 사이드바·CCTV 모달·캡처 패널 세 곳에 각각 박혀 있어
 * 한 곳만 고치면 모달이 지도 중앙에서 어긋났다. 픽셀 계산이 필요한 쪽은
 * Tailwind 임의값 대신 이 상수를 import 한다.
 */
export const NAV_RAIL_WIDTH_PX = 200;
/**
 * 340에서 380으로 넓혔다. 세그먼트가 4개가 되면서 「위치/좌표」 라벨이 잘렸고,
 * 변환 결과·건축물대장 표도 340에서는 답답했다.
 */
export const WORK_PANEL_WIDTH_PX = 380;

/**
 * 지도 영역의 좌측 오프셋. **뷰포트 고정(`position: fixed`) 요소만** 이 값이 필요하다.
 * 지도 컨테이너 안에서 `absolute`로 뜨는 요소는 이미 지도 기준이라 더하면 안 된다.
 */
export const LEFT_OFFSET_PX = NAV_RAIL_WIDTH_PX + WORK_PANEL_WIDTH_PX;

/** 패널이 접히면 레일만 남는다. */
export const COLLAPSED_LEFT_OFFSET_PX = NAV_RAIL_WIDTH_PX;
