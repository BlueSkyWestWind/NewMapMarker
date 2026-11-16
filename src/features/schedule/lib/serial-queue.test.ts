import { describe, expect, it, vi } from "vitest";
import { createSerialQueue } from "@/features/schedule/lib/serial-queue";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSerialQueue", () => {
  it("① 넣은 순서대로 실행하고 각 작업의 결과를 돌려준다", async () => {
    const queue = createSerialQueue();
    const order: string[] = [];
    const d1 = deferred<string>();
    const d2 = deferred<string>();

    const p1 = queue.add(async () => {
      order.push("start-1");
      const v = await d1.promise;
      order.push("end-1");
      return v;
    });
    const p2 = queue.add(async () => {
      order.push("start-2");
      const v = await d2.promise;
      order.push("end-2");
      return v;
    });

    await Promise.resolve();
    expect(order).toEqual(["start-1"]);

    d1.resolve("res-1");
    expect(await p1).toBe("res-1");

    await Promise.resolve();
    expect(order).toEqual(["start-1", "end-1", "start-2"]);

    d2.resolve("res-2");
    expect(await p2).toBe("res-2");
    expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"]);
  });

  it("② 앞 작업이 실패해도 앞 Promise만 거부되고 뒤 작업은 계속 실행된다", async () => {
    const queue = createSerialQueue();
    const d1 = deferred<void>();

    const p1 = queue.add(() => d1.promise);
    const p2 = queue.add(async () => "ok-2");

    d1.reject(new Error("boom"));
    await expect(p1).rejects.toThrow("boom");
    await expect(p2).resolves.toBe("ok-2");
  });

  it("③ 같은 시각에 두 작업이 동시에 실행되지 않는다", async () => {
    const queue = createSerialQueue();
    let running = 0;
    let maxConcurrent = 0;
    const d1 = deferred<void>();
    const d2 = deferred<void>();

    const p1 = queue.add(async () => {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      await d1.promise;
      running -= 1;
    });
    const p2 = queue.add(async () => {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      await d2.promise;
      running -= 1;
    });

    await Promise.resolve();
    expect(running).toBe(1);
    d1.resolve();
    await p1;

    await Promise.resolve();
    expect(running).toBe(1);
    d2.resolve();
    await p2;

    expect(maxConcurrent).toBe(1);
  });

  it("④ pending은 add 직후 +1, 완료 직후 -1이며 변할 때마다 구독자를 부른다", async () => {
    const queue = createSerialQueue();
    const observed: number[] = [];
    queue.subscribe(() => observed.push(queue.pending));

    const d1 = deferred<void>();
    const d2 = deferred<void>();

    const p1 = queue.add(() => d1.promise);
    expect(queue.pending).toBe(1);
    const p2 = queue.add(() => d2.promise);
    expect(queue.pending).toBe(2);

    d1.resolve();
    await p1;
    expect(queue.pending).toBe(1);

    d2.resolve();
    await p2;
    expect(queue.pending).toBe(0);
    expect(observed).toEqual([1, 2, 1, 0]);
  });

  it("⑤ 구독 해제 함수가 동작한다", async () => {
    const queue = createSerialQueue();
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);

    const d1 = deferred<void>();
    const p1 = queue.add(() => d1.promise);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    d1.resolve();
    await p1;
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("⑥ 작업이 동기 예외를 던져도 큐가 막히지 않고 pending이 0으로 돌아온다", async () => {
    const queue = createSerialQueue();
    const p1 = queue.add(() => {
      throw new Error("sync throw");
    });
    const p2 = queue.add(async () => "recovered");

    await expect(p1).rejects.toThrow("sync throw");
    await expect(p2).resolves.toBe("recovered");
    expect(queue.pending).toBe(0);
  });
});
