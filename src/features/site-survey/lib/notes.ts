// 문제점 세부내역 및 대책방안: 본문의 `기타N`과 상세출입방법·건물구분을 문서 순서대로 모은다.

import type { NotesSettings, SurveyDoc } from "../types";

const BODY_SECTIONS = [1, 2, 3, 4, 5, 6];

export function collectNoteParts(doc: SurveyDoc, settings: NotesSettings): string[] {
  const etc = doc.notes();
  const parts: string[] = [];
  for (const section of BODY_SECTIONS) {
    // 치국현황에서는 상세출입방법·건물구분이 그 섹션의 기타 앞에 온다
    if (section === 2) {
      if (settings.includeAccess) parts.push(doc.get({ section: 2, label: "상세출입방법", direction: "right" }));
      if (settings.includeBuilding) parts.push(doc.get({ section: 2, label: "건물구분", direction: "right" }));
    }
    if (settings.includeEtc) {
      for (const note of etc) if (note.section === section) parts.push(note.value);
    }
  }
  return parts.map((p) => p.trim()).filter((p) => p !== "");
}
