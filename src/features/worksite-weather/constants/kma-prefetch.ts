/** 사전 수집 시간대(KST, 시 단위, 양끝 포함): 아침 07시에 시작해 17시에 마지막. */
export const PREFETCH_FIRST_HOUR = 7;
export const PREFETCH_LAST_HOUR = 17;

/**
 * 한 번 불릴 때 받는 격자 수.
 * Workers는 요청 한 번에 보낼 수 있는 외부 요청 수가 제한된다(무료 50건).
 * 격자당 최대 3건(단기·실황·초단기) + 조회·저장 몇 건이 이 안에 들어오도록 보수적으로 잡았다.
 */
export const GRIDS_PER_SLICE = 8;
