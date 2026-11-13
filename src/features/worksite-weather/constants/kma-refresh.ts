/** 같은 격자는 이 시간 안에 다시 받지 않는다(여러 사용자가 눌러도 한 격자는 5분에 한 번만 나간다) */
export const MANUAL_REFRESH_MIN_INTERVAL_MS = 300_000;

/** 갱신 요청 한 번에 받을 수 있는 격자 수. Workers 외부 요청 50건 제한에서 격자당 최악 8건을 잡았다. 클라이언트가 이 수로 나눠 보낸다 */
export const MAX_GRIDS_PER_REFRESH_REQUEST = 5;
