import { DEFAULT_MARKER_COLOR } from '@/features/map-marker/constants/facility-teams';
import {
  DEFAULT_BATTERY_CAPACITY,
  DEFAULT_BATTERY_QUANTITY,
} from '@/features/map-marker/constants/map-config';
import type {
  BatteryMarker,
  EquipmentMarker,
  MapMarkersPayload,
} from '@/features/map-marker/types/marker';
import type { SupabaseBrowserClient } from '@/lib/supabase/client';

interface InformationRow {
  marker_id: string | null;
  place_name: string | null;
  facility_code: string | null;
  project_code: string | null;
  facility_year: string | null;
  business_type: string | null;
  final_station_name: string | null;
  eq_class: string | null;
  eq_type: string | null;
  install_date: string | null;
  open_date: string | null;
}

function formatDateOnly(value: string | null) {
  return value ? value.split('T')[0] : '';
}

function parseCoordinate(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return Number.NaN;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeMarkerTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.map((tag) => String(tag).trim()).filter(Boolean);
        }
      } catch {
        // 구분자 분리로 폴백
      }
    }

    return trimmed
      .split(/[,|/]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function buildInformationIndexes(infoList: InformationRow[]) {
  const infoByMarkerId = new Map<string, InformationRow[]>();
  const infoByName = new Map<string, InformationRow[]>();

  infoList.forEach((info) => {
    if (info.marker_id) {
      const list = infoByMarkerId.get(info.marker_id) ?? [];
      list.push(info);
      infoByMarkerId.set(info.marker_id, list);
    }

    const name = info.place_name?.trim() ?? '';
    if (name) {
      const list = infoByName.get(name) ?? [];
      list.push(info);
      infoByName.set(name, list);
    }
  });

  return { infoByMarkerId, infoByName };
}

/** 한 번에 요청할 행 수. PostgREST 기본 상한(보통 1000)과 맞춰 둔다. */
const FETCH_PAGE_SIZE = 1000;
/** 무한 루프 방지 상한. 5만 행까지 커버한다. */
const MAX_FETCH_PAGES = 50;

export interface FetchPageResult<Row> {
  data: Row[] | null;
  error: { message: string } | null;
  count: number | null;
}

/**
 * PostgREST는 요청 범위와 무관하게 서버 설정 상한(보통 1000행)까지만 돌려준다.
 * `select('*')`만 쓰면 그 이상은 **오류 없이 조용히 잘린다** — 마커가 지도에서 사라지는데
 * 에러도 안 난다. 그래서 총 건수(count)를 보고 다 받을 때까지 이어서 요청한다.
 *
 * 서버 상한이 요청 크기보다 작아도(예: 500) 실제 받은 개수만큼 커서를 옮기므로 누락되지 않는다.
 */
export async function fetchAllRows<Row>(
  fetchPage: (from: number, to: number) => PromiseLike<FetchPageResult<Row>>,
): Promise<Row[]> {
  const rows: Row[] = [];

  for (let page = 0; page < MAX_FETCH_PAGES; page += 1) {
    const from = rows.length;
    const { data, error, count } = await fetchPage(from, from + FETCH_PAGE_SIZE - 1);
    if (error) throw error;

    const batch = data ?? [];
    rows.push(...batch);

    // 더 받을 게 없다
    if (batch.length === 0) break;
    if (count !== null && count !== undefined && rows.length >= count) break;
    // count를 못 받은 경우엔 페이지가 덜 찼는지로 판단한다
    if ((count === null || count === undefined) && batch.length < FETCH_PAGE_SIZE) break;
  }

  return rows;
}

export async function fetchMapMarkers(
  supabase: SupabaseBrowserClient,
): Promise<MapMarkersPayload> {
  // 페이지 경계가 흔들리지 않도록 정렬에 항상 유일 키(id)를 tiebreaker로 붙인다
  const [markersList, infoList, batteryMarkersList, batterySpecsList] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from('markers')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase.from('information').select('*', { count: 'exact' }).order('id').range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from('battery_markers')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase.from('battery_specs').select('*', { count: 'exact' }).order('id').range(from, to),
    ),
  ]);

  const { infoByMarkerId, infoByName } = buildInformationIndexes(
    (infoList ?? []) as InformationRow[],
  );

  const equipmentMarkers: EquipmentMarker[] = (markersList ?? []).map((row) => {
    const markerName = row.name?.trim() ?? '';
    const infos =
      infoByMarkerId.get(row.id) ?? infoByName.get(markerName) ?? [];
    const repInfo = infos[0] ?? null;

    return {
      id: row.id,
      name: row.name ?? '',
      lat: parseCoordinate(row.lat),
      lng: parseCoordinate(row.lng),
      memo: row.memo ?? '',
      tags: normalizeMarkerTags(row.tags),
      color: row.color ?? DEFAULT_MARKER_COLOR,
      facilityTeam: row.facility_team ?? '',
      roadAddress: row.road_address ?? '',
      jibunAddress: row.jibun_address ?? '',
      facilityCode:
        row.facility_code ?? repInfo?.facility_code ?? '',
      projectCode: repInfo?.project_code ?? '',
      facilityYear: repInfo?.facility_year ?? '',
      businessType: repInfo?.business_type ?? '',
      finalStationName: repInfo?.final_station_name ?? '',
      eqClass: repInfo?.eq_class ?? '',
      eqType: repInfo?.eq_type ?? '',
      installDate: repInfo?.install_date ?? '',
      openDate: repInfo?.open_date ?? '',
      parentMarkerId: row.parent_marker_id ?? null,
      groupRole: row.group_role ?? null,
      groupKey: row.group_key ?? null,
      detachedVisible: row.detached_visible ?? false,
      // CR-004 마이그레이션 미적용 DB에서도 조회가 깨지지 않게 optional로 읽는다
      siteAlias: row.site_alias ?? null,
      workType: row.work_type ?? null,
      createdAt: formatDateOnly(row.created_at) || new Date().toISOString().split('T')[0],
    };
  });

  const specsMap = new Map<string, NonNullable<typeof batterySpecsList>>();
  (batterySpecsList ?? []).forEach((spec) => {
    if (!spec.marker_id) return;
    const list = specsMap.get(spec.marker_id) ?? [];
    list.push(spec);
    specsMap.set(spec.marker_id, list);
  });

  const batteryMarkers: BatteryMarker[] = (batteryMarkersList ?? []).map(
    (row) => {
      const specs = specsMap.get(row.id) ?? [];
      const repSpec = specs[0] ?? null;

      return {
        id: row.id,
        name: row.name ?? '',
        lat: parseCoordinate(row.lat),
        lng: parseCoordinate(row.lng),
        address: row.address ?? '',
        memo: row.memo ?? '',
        tags: normalizeMarkerTags(row.tags),
        color: row.color ?? DEFAULT_MARKER_COLOR,
        facilityTeam: row.facility_team ?? '',
        createdAt:
          formatDateOnly(row.created_at) ||
          new Date().toISOString().split('T')[0],
        items: specs.map((spec) => ({
          id: spec.id,
          erpName: spec.erp_name ?? '',
          address: row.address ?? '',
          capacity: spec.capacity ?? DEFAULT_BATTERY_CAPACITY,
          quantity: spec.quantity ?? DEFAULT_BATTERY_QUANTITY,
          stationName: spec.station_name ?? '',
          createdAt:
            formatDateOnly(spec.created_at) ||
            new Date().toISOString().split('T')[0],
        })),
        capacity: repSpec?.capacity ?? DEFAULT_BATTERY_CAPACITY,
        quantity: repSpec?.quantity ?? DEFAULT_BATTERY_QUANTITY,
        stationName: repSpec?.station_name ?? row.name ?? '',
        // CR-004 마이그레이션 미적용 DB에서도 조회가 깨지지 않게 optional로 읽는다
        siteAlias: row.site_alias ?? null,
        workType: row.work_type ?? null,
      };
    },
  );

  return { equipmentMarkers, batteryMarkers };
}
