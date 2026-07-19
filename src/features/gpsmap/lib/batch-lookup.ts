'use client';

import { runSingleLookup, type GpsLookupResult } from './lookup';

const BATCH_DELAY_MS = 350;

export type BatchRowStatus = 'pending' | 'running' | 'done' | 'error';

export interface BatchRow {
  index: number;
  input: string;
  status: BatchRowStatus;
  result: GpsLookupResult | null;
  error: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** textarea 여러 줄을 입력 목록으로 만든다. */
export function parseBatchInputs(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * 여러 건을 순차 조회한다. 진행 상황은 onProgress로 전달한다.
 */
export async function runBatchLookup(
  inputs: string[],
  onProgress: (rows: BatchRow[]) => void,
  options?: { signal?: AbortSignal },
): Promise<BatchRow[]> {
  const rows: BatchRow[] = inputs.map((input, index) => ({
    index,
    input,
    status: 'pending',
    result: null,
    error: '',
  }));
  onProgress(rows.map((row) => ({ ...row })));

  for (let i = 0; i < rows.length; i += 1) {
    if (options?.signal?.aborted) {
      break;
    }

    rows[i] = { ...rows[i], status: 'running' };
    onProgress(rows.map((row) => ({ ...row })));

    try {
      const result = await runSingleLookup(rows[i].input);
      rows[i] = { ...rows[i], status: 'done', result, error: '' };
    } catch (err) {
      rows[i] = {
        ...rows[i],
        status: 'error',
        result: null,
        error: err instanceof Error ? err.message : '조회 실패',
      };
    }

    onProgress(rows.map((row) => ({ ...row })));

    if (i < rows.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return rows;
}
