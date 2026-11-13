import type { SurveyDoc } from "../types";

/** 같은 파일 이름을 다시 올리면 제자리에서 바꿔 넣고, 새 파일은 뒤에 붙인다 */
export function mergeDocsByName(prev: SurveyDoc[], next: SurveyDoc[]): SurveyDoc[] {
  const out = [...prev];
  for (const doc of next) {
    const at = out.findIndex((d) => d.fileName === doc.fileName);
    if (at >= 0) out[at] = doc;
    else out.push(doc);
  }
  return out;
}
