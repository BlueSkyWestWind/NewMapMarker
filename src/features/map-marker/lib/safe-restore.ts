/** 복원 전 백업을 만들지 못했을 때의 오류. 이때 파괴 작업은 시작되지 않았다. */
export class SafetyBackupError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("복원 전 백업 파일을 만들지 못했습니다.");
    this.name = "SafetyBackupError";
    this.cause = cause;
  }
}

/**
 * 데이터를 지우는 작업 앞에 백업을 먼저 실행한다.
 * 백업이 실패하면 파괴 작업을 호출하지 않고 `SafetyBackupError`를 던진다 —
 * 파일을 받지 못했는데 DB를 지우면 되돌릴 방법이 없기 때문이다.
 * 파괴 작업 자체의 오류는 가공하지 않고 그대로 전달한다.
 */
export async function runWithSafetyBackup(
  backup: () => Promise<void>,
  destructive: () => Promise<void>,
): Promise<void> {
  try {
    await backup();
  } catch (error) {
    throw new SafetyBackupError(error);
  }
  await destructive();
}
