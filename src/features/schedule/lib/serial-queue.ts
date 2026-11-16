export interface SerialQueue {
  /** 넣은 순서대로 하나씩 실행한다. 앞 작업이 실패해도 다음 작업은 실행된다. */
  add<T>(task: () => Promise<T>): Promise<T>;
  /** 대기 중 + 실행 중인 작업 수 */
  readonly pending: number;
  /** pending이 바뀔 때 호출되는 구독자를 등록하고, 해제 함수를 돌려준다. */
  subscribe(listener: () => void): () => void;
}

/**
 * 비동기 작업을 동시에 1개씩만 순서대로 실행하는 직렬 대기열을 만든다.
 */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<void> = Promise.resolve();
  let pendingCount = 0;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    add<T>(task: () => Promise<T>): Promise<T> {
      pendingCount += 1;
      notify();

      const run = async (): Promise<T> => {
        try {
          return await task();
        } finally {
          pendingCount -= 1;
          notify();
        }
      };

      const resultPromise = tail.then(run, run);
      tail = resultPromise.then(
        () => undefined,
        () => undefined,
      );
      return resultPromise;
    },
    get pending() {
      return pendingCount;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
