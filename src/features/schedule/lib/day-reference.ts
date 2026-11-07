/** 공정관리·누적·마커에서 상세표의 자동 열(참조 값)을 만드는 순수 함수. 14.4·14.12장. */

import type { DayValues, RefSource, RefValues } from "@/features/schedule/lib/day-types";

/** 공정관리 `방식` → 사업분류 목록 값. */
const BIZ_CLASS_MAP: Record<string, string> = {
  광중계기: "중계기",
  기지국: "기지국",
  광분산: "인빌딩",
  인빌딩: "인빌딩",
};

/** 공정관리 `세부사업 유형` → 사업유형 목록 값. 빈칸이 되는 값은 빈 글로 둔다. */
const BIZ_KIND_MAP: Record<string, string> = {
  "5G": "5G",
  LTE: "LTE",
  WCDMA: "WCDMA",
  Legacy: "WCDMA",
  "-": "",
  이동전화공통: "",
};

/** 공정관리 `사업구분` → 공사유형 목록 값. */
const CONSTRUCTION_TYPE_MAP: Record<string, string> = {
  부대장비증설: "증설",
};

/** 표에 있는 값만 바꾸고, 없으면 앞뒤 공백을 지운 원문을 돌려준다. */
function convert(table: Record<string, string>, value: string): string {
  const text = value.trim();
  return Object.hasOwn(table, text) ? table[text] : text;
}

export function toBizClass(method: string): string {
  return convert(BIZ_CLASS_MAP, method);
}

export function toBizKind(detailType: string): string {
  return convert(BIZ_KIND_MAP, detailType);
}

export function toConstructionType(category: string): string {
  return convert(CONSTRUCTION_TYPE_MAP, category);
}

/** 문자열이 아니거나 공백뿐이면 빈 글. */
function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 빈 값은 키를 만들지 않고 담는다. */
function put(ref: RefValues, key: keyof RefValues, value: string): void {
  if (value.trim() !== "") ref[key] = value;
}

/** `erp_details` 중 참조에 쓰는 열. */
export interface ErpRefRow {
  station_final: string | null;
  facility_code: string | null;
  project: string | null;
  method: string | null;
  biz_category: string | null;
  region_sigungu: string | null;
  equip_final: string | null;
  realty_type: string | null;
  equip_location: string | null;
  address_full: string | null;
  raw: Record<string, unknown> | null;
}

export function erpRowToRef(row: ErpRefRow): RefValues {
  const ref: RefValues = {};
  put(ref, "facilityCode", asText(row.facility_code));
  put(ref, "project", asText(row.project));
  put(ref, "bizClass", toBizClass(asText(row.method)));
  put(ref, "bizKind", toBizKind(asText(row.raw?.["세부사업 유형"])));
  put(ref, "constructionType", toConstructionType(asText(row.biz_category)));
  put(ref, "region", asText(row.region_sigungu));
  put(ref, "equipType", asText(row.equip_final));
  put(ref, "motherStation", asText(row.raw?.["모국 (&기지국)"]));
  put(ref, "realtyType", asText(row.realty_type));
  put(ref, "equipLocation", asText(row.equip_location));
  // 주소는 치환 없이 원본 그대로.
  put(ref, "address", row.address_full ?? "");
  return ref;
}

/** 누적 행의 24열 값에서 참조 열만 뽑는다(프로젝트 제외). */
export function archiveValuesToRef(values: DayValues): RefValues {
  const ref: RefValues = {};
  put(ref, "facilityCode", values.facilityCode);
  put(ref, "bizClass", values.bizClass);
  put(ref, "bizKind", values.bizKind);
  put(ref, "constructionType", values.constructionType);
  put(ref, "region", values.region);
  put(ref, "equipType", values.equipType);
  put(ref, "address", values.address);
  put(ref, "motherStation", values.motherStation);
  put(ref, "realtyType", values.realtyType);
  put(ref, "equipLocation", values.equipLocation);
  return ref;
}

/** 지도 마커·정보에서 참조에 쓰는 값. */
export interface MarkerRefSource {
  name: string;
  finalStationName?: string | null;
  projectCode?: string | null;
  facilityCode?: string | null;
  businessType?: string | null;
  eqType?: string | null;
  roadAddress?: string | null;
  jibunAddress?: string | null;
}

export function markerToRef(marker: MarkerRefSource): RefValues {
  const ref: RefValues = {};
  put(ref, "project", asText(marker.projectCode));
  put(ref, "facilityCode", asText(marker.facilityCode));
  put(ref, "constructionType", toConstructionType(asText(marker.businessType)));
  put(ref, "equipType", asText(marker.eqType));
  put(ref, "address", asText(marker.roadAddress) || asText(marker.jibunAddress));
  return ref;
}

/** 값이 하나라도 있는 첫 층(공정관리 → 누적 → 마커)을 통째로 쓴다. 층 사이에 열을 섞지 않는다. */
export function mergeRefTiers(tiers: {
  erp?: RefValues;
  archive?: RefValues;
  marker?: RefValues;
}): { values: RefValues; source: RefSource | null } {
  const order: RefSource[] = ["erp", "archive", "marker"];
  for (const source of order) {
    const values = tiers[source];
    if (values && Object.keys(values).length > 0) return { values, source };
  }
  return { values: {}, source: null };
}
