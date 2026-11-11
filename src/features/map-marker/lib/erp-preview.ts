import type { ExistingMarkerRef } from "@/features/map-marker/lib/erp-classify";
import type {
  ErpRowPreview,
  StagedErpRow,
} from "@/features/map-marker/types/marker";

/**
 * 위치등록 [기존 건 갱신]·[추가 사업 반영]을 누르기 전에 보여 줄 변경 내용을 만든다.
 * DB 현재 값과 파일 값을 비교할 뿐 아무것도 쓰지 않는다.
 */

/** 비교해 보여 줄 상세(`information`) 칸. 순서가 화면 순서다. */
const INFO_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ["project_code", "프로젝트코드"],
  ["facility_year", "사업연도"],
  ["business_type", "사업구분"],
  ["final_station_name", "국소명-최종"],
  ["eq_class", "장비 대분류"],
  ["eq_type", "장비타입"],
  ["install_date", "시설일"],
  ["open_date", "개통일"],
];

const text = (value: unknown) => String(value ?? "").trim();

/**
 * 갱신 때 같이 지워지고 다시 들어가는 DB 행을 고른다.
 * 프로젝트코드가 있으면 같은 프로젝트의 행, 없으면 첫 행이다(`refreshExistingRows`와 같은 범위).
 */
function pickCurrentInfo(
  row: StagedErpRow,
  marker: ExistingMarkerRef | undefined,
): Record<string, unknown> | undefined {
  const rows = marker?.info_rows ?? [];
  const project = text(row.info.project_code);
  if (!project) return rows[0];
  return (
    rows.find((item) => text(item.project_code) === project) ??
    rows.find((item) => !text(item.project_code))
  );
}

/** 기존 건 갱신: 바뀌는 칸만 `이전 → 이후`로 돌려준다. */
export function previewExistingRow(
  row: StagedErpRow,
  marker: ExistingMarkerRef | undefined,
): ErpRowPreview {
  const changes: ErpRowPreview["changes"] = [];
  const currentName = text(marker?.name);
  if (marker?.name !== undefined && currentName !== text(row.name)) {
    changes.push({ label: "국소명", before: currentName, after: text(row.name) });
  }

  const current = pickCurrentInfo(row, marker);
  if (!current) {
    const project = text(row.info.project_code);
    changes.push({
      label: "상세 행",
      before: "없음",
      after: project ? `새로 추가 (${project})` : "새로 추가",
    });
  } else {
    for (const [field, label] of INFO_FIELDS) {
      const before = text(current[field]);
      const after = text(row.info[field]);
      if (before !== after) changes.push({ label, before, after });
    }
  }
  return { kind: "update", currentName, changes, warning: "" };
}

/** 추가 사업 반영: 새로 들어갈 값(빈 값 제외)과, 시설 상태가 바뀔 수 있는 경우의 경고. */
export function previewAddonRow(row: StagedErpRow): ErpRowPreview {
  const changes = INFO_FIELDS.flatMap(([field, label]) => {
    const after = text(row.info[field]);
    return after ? [{ label, before: "", after }] : [];
  });

  // 올해 이상 연도 행은 시설일이 하나라도 비면 마커 상태가 미시설, 개통일이 비면 시설이 된다.
  let warning = "";
  if (!text(row.info.install_date)) {
    warning = "시설일이 비어 있어 이 마커의 시설 상태가 '미시설'로 바뀔 수 있습니다.";
  } else if (!text(row.info.open_date)) {
    warning = "개통일이 비어 있어 이 마커의 시설 상태가 '시설'로 바뀔 수 있습니다.";
  }
  return { kind: "add", currentName: text(row.name), changes, warning };
}
