import type { SupabaseBrowserClient } from '@/lib/supabase/client';

const LOT_PATTERN = /(\d+(?:-\d+)?번지)/;

/** DB·백업 엑셀 `구분` 열에 쓰는 값 */
export const GROUP_ROLE_REPRESENTATIVE = '대표';
export const GROUP_ROLE_SUB = 'SUB';

export type GroupRole = typeof GROUP_ROLE_REPRESENTATIVE | typeof GROUP_ROLE_SUB;

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

export function normalizeGroupRole(value: unknown): GroupRole | '' {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw === GROUP_ROLE_REPRESENTATIVE) return GROUP_ROLE_REPRESENTATIVE;
  const upper = raw.toUpperCase();
  if (upper === GROUP_ROLE_SUB || raw === '서브' || upper === 'SUB') {
    return GROUP_ROLE_SUB;
  }
  if (upper === 'REP' || upper === 'REPRESENTATIVE') {
    return GROUP_ROLE_REPRESENTATIVE;
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
    .select('id, road_address, jibun_address, created_at, parent_marker_id, group_role');
  if (error) throw error;

  const rows = (data ?? []) as MarkerParentRow[];
  const groups = new Map<string, MarkerParentRow[]>();

  for (const row of rows) {
    const key = getLotAddressKey(resolveMarkerAddress(row));
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

  // 주소가 비어 그룹에 안 들어간 행은 모두 대표로 둔다.
  const groupedIds = new Set(updates.map((item) => item.id));
  for (const row of rows) {
    if (!groupedIds.has(row.id)) {
      updates.push({
        id: row.id,
        parent_marker_id: null,
        group_role: GROUP_ROLE_REPRESENTATIVE,
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
    .select('id, road_address, jibun_address, created_at, group_role');
  if (error) throw error;

  const rows = (data ?? []) as MarkerParentRow[];
  const hasStored = rows.some((row) => normalizeGroupRole(row.group_role));
  if (!hasStored) {
    const result = await assignMarkerParentsByLotAddress(supabase);
    return { ...result, usedStoredRoles: false };
  }

  const groups = new Map<string, MarkerParentRow[]>();
  for (const row of rows) {
    const key = getLotAddressKey(resolveMarkerAddress(row)) || `__solo__${row.id}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const updates: RoleUpdate[] = [];

  for (const group of groups.values()) {
    group.sort(sortByCreatedAtThenId);
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
