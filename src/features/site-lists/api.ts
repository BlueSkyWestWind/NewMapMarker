import { fetchAllRows } from "@/features/map-marker/api";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { planSiteListRestore } from "@/features/site-lists/lib/site-list-view";
import type {
  SiteList,
  SiteListBackup,
  SiteListData,
  SiteListMember,
} from "@/features/site-lists/types";

const WRITE_CHUNK_SIZE = 200;
/** 전체 삭제 조건용. 실제 범위는 DB 정책이 정한다. */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function fetchIsAppAdmin(
  supabase: SupabaseBrowserClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("app_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function fetchSiteListData(
  supabase: SupabaseBrowserClient,
  userId: string,
): Promise<SiteListData> {
  const [listRows, memberRows, isAdmin] = await Promise.all([
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from("site_lists")
        .select("id, name, color, is_admin_list", { count: "exact" })
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from("site_list_members")
        .select("list_id, marker_id", { count: "exact" })
        .order("list_id")
        .order("marker_id")
        .range(from, to),
    ),
    fetchIsAppAdmin(supabase, userId),
  ]);

  return {
    lists: listRows.map(
      (row): SiteList => ({
        id: String(row.id),
        name: String(row.name),
        color: String(row.color),
        isAdminList: row.is_admin_list === true,
      }),
    ),
    members: memberRows.map(
      (row): SiteListMember => ({
        listId: String(row.list_id),
        markerId: String(row.marker_id),
      }),
    ),
    isAdmin,
  };
}

export async function createSiteList(
  supabase: SupabaseBrowserClient,
  input: { name: string; color: string; isAdmin: boolean },
) {
  const { error } = await supabase.from("site_lists").insert({
    name: input.name,
    color: input.color,
    // 관리자가 만든 목록은 관리자 목록이다.
    is_admin_list: input.isAdmin,
  });
  if (error) throw error;
}

export async function updateSiteList(
  supabase: SupabaseBrowserClient,
  id: string,
  input: { name: string; color: string },
) {
  const { error } = await supabase.from("site_lists").update(input).eq("id", id);
  if (error) throw error;
}

/** 소속만 함께 지워진다. 장비 국소는 그대로 남는다. */
export async function deleteSiteList(supabase: SupabaseBrowserClient, id: string) {
  const { error } = await supabase.from("site_lists").delete().eq("id", id);
  if (error) throw error;
}

export async function addSiteListMembers(
  supabase: SupabaseBrowserClient,
  listId: string,
  markerIds: string[],
) {
  const rows = markerIds.map((markerId) => ({ list_id: listId, marker_id: markerId }));
  for (const batch of chunk(rows, WRITE_CHUNK_SIZE)) {
    const { error } = await supabase
      .from("site_list_members")
      .upsert(batch, { onConflict: "list_id,marker_id", ignoreDuplicates: true });
    if (error) throw error;
  }
}

/** 목록에서 뺀다. 장비 국소는 삭제하지 않는다. */
export async function removeSiteListMembers(
  supabase: SupabaseBrowserClient,
  listId: string,
  markerIds: string[],
) {
  for (const batch of chunk(markerIds, WRITE_CHUNK_SIZE)) {
    const { error } = await supabase
      .from("site_list_members")
      .delete()
      .eq("list_id", listId)
      .in("marker_id", batch);
    if (error) throw error;
  }
}

/** 전체 백업용 원본 행 */
export async function fetchSiteListBackup(
  supabase: SupabaseBrowserClient,
): Promise<SiteListBackup> {
  const [lists, members] = await Promise.all([
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from("site_lists")
        .select("id, name, color, is_admin_list", { count: "exact" })
        .order("id")
        .range(from, to),
    ),
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from("site_list_members")
        .select("list_id, marker_id", { count: "exact" })
        .order("list_id")
        .order("marker_id")
        .range(from, to),
    ),
  ]);
  return { lists, members };
}

/**
 * 백업의 목록을 되살린다. 일반 사용자는 DB 정책상 일반 목록만 지우고 넣을 수 있어
 * 관리자 목록은 그대로 남는다.
 */
export async function restoreSiteLists(
  supabase: SupabaseBrowserClient,
  backup: SiteListBackup,
  isAdmin: boolean,
): Promise<{ listCount: number; memberCount: number }> {
  const plan = planSiteListRestore(backup, isAdmin);

  const { error: clearError } = await supabase
    .from("site_lists")
    .delete()
    .neq("id", NIL_UUID);
  if (clearError) throw clearError;

  for (const batch of chunk(plan.lists, WRITE_CHUNK_SIZE)) {
    const { error } = await supabase.from("site_lists").insert(
      batch.map((list) => ({
        id: list.id,
        name: list.name,
        color: list.color,
        is_admin_list: String(list.is_admin_list).toLowerCase() === "true",
      })),
    );
    if (error) throw error;
  }
  for (const batch of chunk(plan.members, WRITE_CHUNK_SIZE)) {
    const { error } = await supabase.from("site_list_members").insert(
      batch.map((member) => ({
        list_id: member.list_id,
        marker_id: String(member.marker_id),
      })),
    );
    if (error) throw error;
  }
  return { listCount: plan.lists.length, memberCount: plan.members.length };
}
