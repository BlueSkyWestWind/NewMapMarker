import { DEFAULT_MARKER_COLOR } from '@/features/map-marker/constants/facility-teams';
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

export async function fetchMapMarkers(
  supabase: SupabaseBrowserClient,
): Promise<MapMarkersPayload> {
  const [
    { data: markersList, error: markersError },
    { data: infoList, error: infoError },
    { data: batteryMarkersList, error: batteryMarkersError },
    { data: batterySpecsList, error: batterySpecsError },
  ] = await Promise.all([
    supabase.from('markers').select('*').order('created_at', { ascending: false }),
    supabase.from('information').select('*'),
    supabase
      .from('battery_markers')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase.from('battery_specs').select('*'),
  ]);

  if (markersError) throw markersError;
  if (infoError) throw infoError;
  if (batteryMarkersError) throw batteryMarkersError;
  if (batterySpecsError) throw batterySpecsError;

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
          capacity: spec.capacity ?? 600,
          quantity: spec.quantity ?? 12,
          stationName: spec.station_name ?? '',
          createdAt:
            formatDateOnly(spec.created_at) ||
            new Date().toISOString().split('T')[0],
        })),
        capacity: repSpec?.capacity ?? 600,
        quantity: repSpec?.quantity ?? 12,
        stationName: repSpec?.station_name ?? row.name ?? '',
      };
    },
  );

  return { equipmentMarkers, batteryMarkers };
}
