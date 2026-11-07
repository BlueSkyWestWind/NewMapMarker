import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import type { InfoRecord } from "../types";

const CHUNK = 100;

interface InfoDbRow {
  id: number;
  marker_id: string | null;
  project_code: string | null;
  facility_year: string | null;
  business_type: string | null;
  final_station_name: string | null;
  eq_class: string | null;
  eq_type: string | null;
  install_date: string | null;
  open_date: string | null;
}

function dateOnly(value: string | null): string {
  return value ? value.split("T")[0] : "";
}

function toRecord(row: InfoDbRow): InfoRecord {
  return {
    id: row.id,
    markerId: row.marker_id ?? "",
    projectCode: row.project_code ?? "",
    facilityYear: row.facility_year ?? "",
    businessType: row.business_type ?? "",
    finalStationName: row.final_station_name ?? "",
    eqClass: row.eq_class ?? "",
    eqType: row.eq_type ?? "",
    installDate: dateOnly(row.install_date),
    openDate: dateOnly(row.open_date),
  };
}

/** 마커 ID들의 정보 행을 100개씩 나눠 조회한다. */
export async function fetchInfoRows(
  supabase: SupabaseBrowserClient,
  markerIds: string[],
): Promise<InfoRecord[]> {
  const records: InfoRecord[] = [];
  for (let i = 0; i < markerIds.length; i += CHUNK) {
    const chunk = markerIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("information")
      .select("*")
      .in("marker_id", chunk);
    if (error) throw error;
    for (const row of (data ?? []) as InfoDbRow[]) records.push(toRecord(row));
  }
  return records.sort((a, b) => a.id - b.id);
}
