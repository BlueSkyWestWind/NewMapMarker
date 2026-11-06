/** 위치 메뉴의 국소 목록 */
export interface SiteList {
  id: string;
  name: string;
  color: string;
  /** 관리자가 만든 목록. 관리자만 수정한다 */
  isAdminList: boolean;
}

/** 목록과 장비 국소의 연결 */
export interface SiteListMember {
  listId: string;
  markerId: string;
}

/** 지도 핀에 표시할 목록 색상 */
export interface SiteListBadge {
  colors: string[];
  /** 색상으로 표시하지 못한 나머지 목록 수 */
  extraCount: number;
}

export interface SiteListData {
  lists: SiteList[];
  members: SiteListMember[];
  isAdmin: boolean;
}

/** 백업 파일의 목록 시트 내용 */
export interface SiteListBackup {
  lists: Array<Record<string, unknown>>;
  members: Array<Record<string, unknown>>;
}
