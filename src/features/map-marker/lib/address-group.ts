import type { SupabaseBrowserClient } from '@/lib/supabase/client';

const LOT_PATTERN = /(\d+(?:-\d+)?번지)/;

/** DB·백업 엑셀 `구분` 열에 쓰는 값 */
export const GROUP_ROLE_REPRESENTATIVE = '대표';
export const GROUP_ROLE_SUB = 'SUB';
/** 단독: 같은 지번에 마커가 1개뿐(그룹 없음)인 경우 */
export const GROUP_ROLE_STANDALONE = '단독';

export type GroupRole =
  | typeof GROUP_ROLE_REPRESENTATIVE
  | typeof GROUP_ROLE_SUB
  | typeof GROUP_ROLE_STANDALONE;

export function normalizeAddress(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

/**
 * 번지까지 주소 키.
 * - `… 1900번지` 형태면 번지 포함 앞부분까지
 * - 번지가 없으면 정규화 전체 문자열
 * - 빈 주소는 빈 문자열(그룹하지 않음)
 */
export function getLotAddressKey(address: string): string {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return '';
  }

  const match = LOT_PATTERN.exec(normalized);
  if (!match || match.index === undefined) {
    return normalized;
  }

  return normalized.slice(0, match.index + match[1].length);
}

export function resolveMarkerAddress(row: {
  road_address?: string | null;
  jibun_address?: string | null;
  address_full?: string | null;
}): string {
  return (
    row.road_address?.trim() ||
    row.jibun_address?.trim() ||
    row.address_full?.trim() ||
    ''
  );
}

/**
 * 그룹 판정용 유효 키.
 * - `group_key` 값이 있으면 그것(번지 하위 분리 그룹)
 * - 없으면 번지 주소 키(`getLotAddressKey`) = 기존 동작
 * 값이 전혀 없으면 빈 문자열(그룹하지 않음).
 */
export function getEffectiveGroupKey(row: {
  road_address?: string | null;
  jibun_address?: string | null;
  address_full?: string | null;
  group_key?: string | null;
}): string {
  const manual = row.group_key?.trim();
  if (manual) return manual;
  return getLotAddressKey(resolveMarkerAddress(row));
}

/** 번지 하위 분리용 안정 group_key 생성. 예) `광주 … 695-6번지#103동#a1b2c3d4`. */
export function buildSplitGroupKey(
  lotKey: string,
  label: string,
  seedId: string,
): string {
  return `${lotKey}#${label}#${seedId.slice(0, 8)}`;
}

export function normalizeGroupRole(value: unknown): GroupRole | '' {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw === GROUP_ROLE_REPRESENTATIVE) return GROUP_ROLE_REPRESENTATIVE;
  if (raw === GROUP_ROLE_STANDALONE) return GROUP_ROLE_STANDALONE;
  const upper = raw.toUpperCase();
  if (upper === GROUP_ROLE_SUB || raw === '서브' || upper === 'SUB') {
    return GROUP_ROLE_SUB;
  }
  if (upper === 'REP' || upper === 'REPRESENTATIVE') {
    return GROUP_ROLE_REPRESENTATIVE;
  }
  if (upper === 'STANDALONE' || upper === 'SOLO') {
    return GROUP_ROLE_STANDALONE;
  }
  return '';
}

interface MarkerParentRow {
  id: string;
  road_address: string | null;
  jibun_address: string | null;
  created_at: string | null;
  parent_marker_id?: string | null;
  group_role?: string | null;
  group_key?: string | null;
}

interface RoleUpdate {
  id: string;
  parent_marker_id: string | null;
  group_role: GroupRole;
}

const UPDATE_CHUNK_SIZE = 100;

async function applyRoleUpdates(
  supabase: SupabaseBrowserClient,
  updates: RoleUpdate[],
): Promise<{ groupCount: number; subCount: number }> {
  for (let i = 0; i < updates.length; i += UPDATE_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + UPDATE_CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (item) => {
        const { error: updateError } = await supabase
          .from('markers')
          .update({
            parent_marker_id: item.parent_marker_id,
            group_role: item.group_role,
          })
          .eq('id', item.id);
        if (updateError) throw updateError;
      }),
    );
  }

  const subCount = updates.filter((item) => item.group_role === GROUP_ROLE_SUB).length;
  const groupCount = updates.filter(
    (item) => item.group_role === GROUP_ROLE_REPRESENTATIVE,
  ).length;
  return { groupCount, subCount };
}

function sortByCreatedAtThenId(a: MarkerParentRow, b: MarkerParentRow) {
  const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
  const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
  if (aTime !== bTime) {
    return aTime - bTime;
  }
  return a.id.localeCompare(b.id);
}

/**
 * 장비 markers 전체를 번지 주소 기준으로 재그룹한다.
 * 그룹 내 created_at 최초(동률이면 id) = 대표, 나머지 = SUB.
 * `parent_marker_id` + `group_role` 을 함께 저장한다.
 */
export async function assignMarkerParentsByLotAddress(
  supabase: SupabaseBrowserClient,
): Promise<{ groupCount: number; subCount: number }> {
  const { data, error } = await supabase
    .from('markers')
    .select(
      'id, road_address, jibun_address, created_at, parent_marker_id, group_role, group_key',
    );
  if (error) throw error;

  const rows = (data ?? []) as MarkerParentRow[];
  const groups = new Map<string, MarkerParentRow[]>();

  for (const row of rows) {
    // group_key 가 있으면 그 키(번지 하위 분리 그룹), 없으면 번지 키로 그룹.
    const key = getEffectiveGroupKey(row);
    if (!key) {
      continue;
    }
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const updates: RoleUpdate[] = [];

  for (const group of groups.values()) {
    group.sort(sortByCreatedAtThenId);

    const representative = group[0];
    if (!representative) {
      continue;
    }

    // 같은 지번에 1개뿐이면 단독, 2개 이상이면 대표+SUB
    if (group.length === 1) {
      updates.push({
        id: representative.id,
        parent_marker_id: null,
        group_role: GROUP_ROLE_STANDALONE,
      });
      continue;
    }

    updates.push({
      id: representative.id,
      parent_marker_id: null,
      group_role: GROUP_ROLE_REPRESENTATIVE,
    });
    for (let i = 1; i < group.length; i += 1) {
      const sub = group[i];
      if (!sub) continue;
      updates.push({
        id: sub.id,
        parent_marker_id: representative.id,
        group_role: GROUP_ROLE_SUB,
      });
    }
  }

  // 주소가 비어 그룹에 안 들어간 행은 단독으로 둔다.
  const groupedIds = new Set(updates.map((item) => item.id));
  for (const row of rows) {
    if (!groupedIds.has(row.id)) {
      updates.push({
        id: row.id,
        parent_marker_id: null,
        group_role: GROUP_ROLE_STANDALONE,
      });
    }
  }

  return applyRoleUpdates(supabase, updates);
}

/**
 * 백업 엑셀 `구분`(대표/SUB) 값을 우선해 parent_marker_id·group_role 을 맞춘다.
 * 그룹 내 대표가 없거나 여러 개면 created_at 기준으로 한 명만 대표로 고른다.
 */
export async function applyMarkerRolesFromStoredGroupRole(
  supabase: SupabaseBrowserClient,
): Promise<{ groupCount: number; subCount: number; usedStoredRoles: boolean }> {
  const { data, error } = await supabase
    .from('markers')
    .select('id, road_address, jibun_address, created_at, group_role, group_key');
  if (error) throw error;

  const rows = (data ?? []) as MarkerParentRow[];
  const hasStored = rows.some((row) => normalizeGroupRole(row.group_role));
  if (!hasStored) {
    const result = await assignMarkerParentsByLotAddress(supabase);
    return { ...result, usedStoredRoles: false };
  }

  const updates: RoleUpdate[] = [];

  // 수동으로 '단독' 지정한 마커는 그룹에서 제외하고 단독 유지(재업로드에도 보존)
  const groups = new Map<string, MarkerParentRow[]>();
  for (const row of rows) {
    if (normalizeGroupRole(row.group_role) === GROUP_ROLE_STANDALONE) {
      updates.push({
        id: row.id,
        parent_marker_id: null,
        group_role: GROUP_ROLE_STANDALONE,
      });
      continue;
    }
    const key = getEffectiveGroupKey(row) || `__solo__${row.id}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    group.sort(sortByCreatedAtThenId);

    // 그룹에 1개만 남으면 단독
    if (group.length === 1) {
      updates.push({
        id: group[0].id,
        parent_marker_id: null,
        group_role: GROUP_ROLE_STANDALONE,
      });
      continue;
    }

    const markedReps = group.filter(
      (row) => normalizeGroupRole(row.group_role) === GROUP_ROLE_REPRESENTATIVE,
    );
    const representative = markedReps[0] ?? group[0];
    if (!representative) continue;

    updates.push({
      id: representative.id,
      parent_marker_id: null,
      group_role: GROUP_ROLE_REPRESENTATIVE,
    });
    for (const row of group) {
      if (row.id === representative.id) continue;
      updates.push({
        id: row.id,
        parent_marker_id: representative.id,
        group_role: GROUP_ROLE_SUB,
      });
    }
  }

  const result = await applyRoleUpdates(supabase, updates);
  return { ...result, usedStoredRoles: true };
}
