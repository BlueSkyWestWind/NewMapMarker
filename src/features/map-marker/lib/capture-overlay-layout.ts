/**
 * 캡처 직전 정보창 재배치를 React 렌더 타이밍과 분리해 동기 호출한다.
 */

type CaptureOverlayLayoutRunner = () => void;

let runner: CaptureOverlayLayoutRunner | null = null;

export function registerCaptureOverlayLayoutRunner(
  nextRunner: CaptureOverlayLayoutRunner | null,
): void {
  runner = nextRunner;
}

export function runCaptureOverlayLayout(): void {
  runner?.();
}
