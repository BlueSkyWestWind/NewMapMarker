import { describe, expect, it } from "vitest";
import { runWithSafetyBackup, SafetyBackupError } from "./safe-restore";

describe("runWithSafetyBackup", () => {
  it("백업이 끝난 뒤에 파괴 작업을 실행한다", async () => {
    const calls: string[] = [];
    await runWithSafetyBackup(
      async () => {
        calls.push("backup");
      },
      async () => {
        calls.push("destructive");
      },
    );
    expect(calls).toEqual(["backup", "destructive"]);
  });

  it("백업이 실패하면 파괴 작업을 호출하지 않고 SafetyBackupError를 던진다", async () => {
    let destructiveCalls = 0;
    const cause = new Error("disk");
    const promise = runWithSafetyBackup(
      async () => {
        throw cause;
      },
      async () => {
        destructiveCalls += 1;
      },
    );
    await expect(promise).rejects.toBeInstanceOf(SafetyBackupError);
    await expect(promise).rejects.toMatchObject({ cause });
    expect(destructiveCalls).toBe(0);
  });

  it("파괴 작업의 오류는 그대로 전달한다", async () => {
    const boom = new Error("insert failed");
    const promise = runWithSafetyBackup(
      async () => {},
      async () => {
        throw boom;
      },
    );
    await expect(promise).rejects.toBe(boom);
  });
});
