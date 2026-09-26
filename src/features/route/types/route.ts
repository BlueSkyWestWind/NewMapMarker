export type RoutePriority = "RECOMMEND" | "TIME" | "DISTANCE";

export interface RouteCoordinate {
  lat: number;
  lng: number;
}

/** 지도/마커에서 선택한 경로 지점. 20m 이내 중복 마커는 하나로 병합될 수 있다. */
export interface RoutePoint extends RouteCoordinate {
  routePointId: string;
  markerIds: string[];
  name: string;
}

/** 클라이언트 → 서버 단일 정규화 요청. 서버는 카카오 API 종류를 감춘다. */
export interface RoutePlanRequest {
  origin: { id: string; name: string; lat: number; lng: number };
  stops: { id: string; name: string; lat: number; lng: number }[];
  roundTrip: boolean;
  priority: RoutePriority;
  avoidToll: boolean;
}

export interface RouteSection {
  distance: number;
  duration: number;
}

export interface NormalizedRouteLeg {
  type: "outbound" | "return";
  distance: number;
  duration: number;
  toll: number;
  sections: RouteSection[];
  path: RouteCoordinate[];
}

export interface NormalizedRouteResult {
  totalDistance: number;
  totalDuration: number;
  totalToll: number;
  legs: NormalizedRouteLeg[];
}

export type RouteErrorCode =
  | "INVALID_REQUEST"
  | "ORIGIN_UNREACHABLE"
  | "DEST_UNREACHABLE"
  | "SAME_POINT"
  | "WAYPOINT_UNREACHABLE"
  | "RATE_LIMIT"
  | "UPSTREAM_AUTH"
  | "TIMEOUT"
  | "UPSTREAM_ERROR"
  | "SERVER_ERROR";

export interface RouteErrorPayload {
  code: RouteErrorCode;
  message: string;
}
