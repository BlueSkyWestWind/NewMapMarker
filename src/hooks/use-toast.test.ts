import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TOAST_DURATION, toast } from './use-toast';

describe('toast auto-dismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('기본 duration(10초)이 지나면 자동으로 닫힌다', () => {
    expect(DEFAULT_TOAST_DURATION).toBe(10000);

    const handle = toast({
      title: '전체 백업 완료',
      description: '20261107_mapmarker_backup.xlsx',
    });

    vi.advanceTimersByTime(9999);
    // 10초 직전에는 아직 제거 큐로 넘어가지 않는다.
    vi.advanceTimersByTime(1);
    // 10초 도달 시 dismiss()가 호출되고, REMOVE_DELAY(5초) 후 배열에서 완전히 제거된다.
    vi.advanceTimersByTime(5000);

    expect(handle.id).toBeTruthy();
  });

  it('지정한 duration(10000ms) 후 자동으로 dismiss된다', () => {
    const onOpenChange = vi.fn();
    toast({
      title: '전체 백업 완료',
      duration: 10000,
      onOpenChange,
    });

    vi.advanceTimersByTime(10000);
    // toast 내부의 onOpenChange는 덮어씌워지므로 에러 없이 타이머가 소진되는지 확인
    expect(vi.getTimerCount()).toBe(1); // REMOVE_TOAST 타이머 1개만 남음
    vi.advanceTimersByTime(5000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
