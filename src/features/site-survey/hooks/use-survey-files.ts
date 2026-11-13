"use client";

import { useCallback, useState } from "react";
import { mergeDocsByName } from "../lib/merge-docs";
import { filterSurveyFiles, readSurveyFiles } from "../lib/parse-survey";
import type { SurveyDoc } from "../types";

/** 한 번에 올린 파일이 이 개수를 넘으면 안내 문구만 보인다(상한은 두지 않는다) */
export const MANY_FILES_NOTICE = 50;

export interface SkippedFile {
  name: string;
  reason: "temp" | "not-xlsx";
}

export interface UseSurveyFiles {
  docs: SurveyDoc[];
  /** 마지막으로 올린 파일 중 양식이 아니거나 읽지 못한 것 */
  errors: { name: string; message: string }[];
  /** 마지막으로 올린 파일 중 건너뛴 것(`~$` 임시 파일, 엑셀이 아닌 파일) */
  skipped: SkippedFile[];
  isReading: boolean;
  /** 마지막으로 올린 파일 수가 안내 기준을 넘었는가 */
  isMany: boolean;
  addFiles(files: File[]): Promise<void>;
  clear(): void;
}

export function useSurveyFiles(): UseSurveyFiles {
  const [docs, setDocs] = useState<SurveyDoc[]>([]);
  const [errors, setErrors] = useState<{ name: string; message: string }[]>([]);
  const [skipped, setSkipped] = useState<SkippedFile[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [isMany, setIsMany] = useState(false);

  const addFiles = useCallback(async (files: File[]) => {
    const { accepted, skipped: skippedNow } = filterSurveyFiles(files);
    setSkipped(skippedNow);
    setErrors([]);
    setIsMany(accepted.length > MANY_FILES_NOTICE);
    if (accepted.length === 0) return;
    setIsReading(true);
    try {
      const result = await readSurveyFiles(accepted);
      setErrors(result.errors);
      setDocs((prev) => mergeDocsByName(prev, result.docs));
    } finally {
      setIsReading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setDocs([]);
    setErrors([]);
    setSkipped([]);
    setIsMany(false);
  }, []);

  return { docs, errors, skipped, isReading, isMany, addFiles, clear };
}
