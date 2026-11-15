/** 비동기 요청 티켓. 발급 시점 이후 새 요청이나 무효화가 있었는지 판정한다. */
export interface RequestTicket {
  isCurrent(): boolean;
}

/** 마지막으로 시작한 비동기 요청만 유효하게 취급하는 상태기. */
export interface LatestRequest {
  begin(): RequestTicket;
  invalidate(): void;
}

/**
 * 가장 최근 요청만 반영하도록 요청 티켓을 발급한다.
 * `begin()` 또는 `invalidate()`가 호출되면 이전 티켓은 모두 오래된 것이 된다.
 */
export function createLatestRequest(): LatestRequest {
  let seq = 0;

  return {
    begin(): RequestTicket {
      const ticketSeq = ++seq;
      return {
        isCurrent: () => seq === ticketSeq,
      };
    },
    invalidate(): void {
      seq += 1;
    },
  };
}
