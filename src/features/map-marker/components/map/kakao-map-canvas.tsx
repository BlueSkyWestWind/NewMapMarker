"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_LEVEL,
  MAP_MARKER_QUERY_KEY,
  MAX_MAP_LEVEL,
  MIN_MAP_LEVEL,
} from "@/features/map-marker/constants/map-config";
import { markerPassesFilters } from "@/features/map-marker/lib/marker-filters";
import {
  applyClusterPieStyles,
  zoomMapToCluster,
  type ClusterIconStyle,
} from "@/features/map-marker/lib/cluster-pie";
import { registerCaptureOverlayLayoutRunner } from "@/features/map-marker/lib/capture-overlay-layout";
import {
  applyOverlayOffset,
  DEFAULT_OVERLAY_OFFSET,
  enableOverlayDrag,
  type OverlayPanelOffset,
} from "@/features/map-marker/lib/overlay-drag";
import {
  CAPTURE_DOT_SIZE,
  getEffectiveMarkerColor,
  getMarkerImageUri,
} from "@/features/map-marker/lib/marker-svg";
import {
  createAddressLookupContent,
  createCaptureLabelContent,
  createOverlayContent,
} from "@/features/map-marker/lib/overlay-content";
import {
  collectLocationGroupNames,
  pickLocationOverlayRepresentatives,
} from "@/features/map-marker/lib/location-marker-groups";
import { useKakaoMapSdk } from "@/features/map-marker/hooks/use-kakao-map-sdk";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import type {
  EquipmentMarker,
  MapMode,
  MarkerFilterState,
  MarkerRecord,
} from "@/features/map-marker/types/marker";

function isEquipmentSubMarker(marker: { parentMarkerId?: string | null }) {
  return Boolean(marker.parentMarkerId);
}
import {
  screenRectToMapBounds,
  type MapBoundsLiteral,
} from "@/features/map-marker/lib/map-capture-stitch";
import { MapFloatingControls } from "@/features/map-marker/components/map/map-floating-controls";
import {
  MapRegionCapturePanel,
  type CaptureGuideState,
} from "@/features/map-marker/components/map/map-region-capture-panel";
import { MapRegionSelectOverlay } from "@/features/map-marker/components/map/map-region-select-overlay";
import { MapRegionBoundsGuide } from "@/features/map-marker/components/map/map-region-bounds-guide";
import { useToast } from "@/hooks/use-toast";

interface KakaoMapCanvasProps {
  markers: MarkerRecord[];
  mode: MapMode;
  filters: MarkerFilterState;
}

interface ModifierKeysState {
  ctrl: boolean;
  shift: boolean;
}

function isPlottableCoordinate(lat: number, lng: number) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
  );
}

function fitMapToMarkers(map: KakaoMap, plottedMarkers: MarkerRecord[]) {
  if (!window.kakao?.maps || plottedMarkers.length === 0) return;

  const bounds = new window.kakao.maps.LatLngBounds();
  plottedMarkers.forEach((marker) => {
    bounds.extend(new window.kakao.maps.LatLng(marker.lat, marker.lng));
  });
  map.setBounds(bounds);
}

function closeAllOverlays(overlays: Map<string, KakaoCustomOverlay>) {
  overlays.forEach((overlay) => overlay.setMap(null));
  overlays.clear();
}

function isMultiSelectGesture(
  mouseEvent: MouseEvent | undefined,
  modifierKeys: ModifierKeysState,
) {
  return Boolean(
    mouseEvent?.ctrlKey ||
    mouseEvent?.metaKey ||
    mouseEvent?.shiftKey ||
    modifierKeys.ctrl ||
    modifierKeys.shift,
  );
}

export function KakaoMapCanvas({
  markers,
  mode,
  filters,
}: KakaoMapCanvasProps) {
  const { supabase, isAuthenticated } = useAuthSession();
  const queryClient = useQueryClient();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<KakaoMap | null>(null);
  const [mapInstance, setMapInstance] = useState<KakaoMap | null>(null);
  const [isRegionSelectMode, setIsRegionSelectMode] = useState(false);
  const [isCapturePanelOpen, setIsCapturePanelOpen] = useState(false);
  const [captureBounds, setCaptureBounds] = useState<MapBoundsLiteral | null>(
    null,
  );
  const [captureGuide, setCaptureGuide] = useState<CaptureGuideState>({
    plan: null,
    viewportSpan: null,
    capturedCount: 0,
  });
  const [excludedTiles, setExcludedTiles] = useState<Set<number>>(
    () => new Set(),
  );
  const prevTileCountRef = useRef(0);

  // 격자 구성(레벨·겹침·범위)이 바뀌어 타일 수가 달라지면 제외 선택을 초기화한다.
  const handleCaptureGuideChange = useCallback((guide: CaptureGuideState) => {
    const count = guide.plan?.tiles.length ?? 0;
    if (count !== prevTileCountRef.current) {
      prevTileCountRef.current = count;
      setExcludedTiles(new Set());
    }
    setCaptureGuide(guide);
  }, []);

  const handleToggleExcludedTile = useCallback((index: number) => {
    setExcludedTiles((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);
  const clustererRef = useRef<KakaoMarkerClusterer | null>(null);
  const markersRef = useRef<KakaoMarker[]>([]);
  const overlaysRef = useRef<Map<string, KakaoCustomOverlay>>(new Map());
  const overlayOffsetsRef = useRef<Map<string, OverlayPanelOffset>>(new Map());
  const rightClickOverlayRef = useRef<KakaoCustomOverlay | null>(null);
  const markerDataByIdRef = useRef<Map<string, MarkerRecord>>(new Map());
  const modifierKeysRef = useRef<ModifierKeysState>({
    ctrl: false,
    shift: false,
  });
  const skipNextFocusRef = useRef(false);
  const { isReady, error, retry } = useKakaoMapSdk();

  const isClusteringEnabled = useMapMarkerStore(
    (state) => state.isClusteringEnabled,
  );
  const clusterIconStyle = useMapMarkerStore((state) => state.clusterIconStyle);
  const isCadastralMode = useMapMarkerStore((state) => state.isCadastralMode);
  const placeSearch = useMapMarkerStore((state) => state.placeSearch);
  const searchPolygonsRef = useRef<KakaoPolygon[]>([]);
  const searchMarkerRef = useRef<KakaoMarker | null>(null);
  const clusterIconStyleRef = useRef<ClusterIconStyle>(clusterIconStyle);
  clusterIconStyleRef.current = clusterIconStyle;

  const openDetailModal = useMapMarkerStore((state) => state.openDetailModal);
  const openEditModal = useMapMarkerStore((state) => state.openEditModal);
  const openRoadview = useMapMarkerStore((state) => state.openRoadview);
  const updatePendingMarker = useMapMarkerStore(
    (state) => state.updatePendingMarker,
  );
  const setSelectedMarkerId = useMapMarkerStore(
    (state) => state.setSelectedMarkerId,
  );
  const toggleSelectedMarkerId = useMapMarkerStore(
    (state) => state.toggleSelectedMarkerId,
  );
  const clearSelectedMarkers = useMapMarkerStore(
    (state) => state.clearSelectedMarkers,
  );
  const selectedMarkerId = useMapMarkerStore((state) => state.selectedMarkerId);
  const selectedMarkerIds = useMapMarkerStore(
    (state) => state.selectedMarkerIds,
  );
  const isInfoWindowCaptureMode = useMapMarkerStore(
    (state) => state.isInfoWindowCaptureMode,
  );
  const isDetailOpen = useMapMarkerStore((state) => state.isDetailOpen);
  const isEditOpen = useMapMarkerStore((state) => state.isEditOpen);
  const { toast } = useToast();

  const prevModeRef = useRef<MapMode | null>(null);

  useEffect(() => {
    const syncModifierKeys = (event: KeyboardEvent) => {
      modifierKeysRef.current = {
        ctrl: event.ctrlKey || event.metaKey,
        shift: event.shiftKey,
      };
    };
    const resetModifierKeys = () => {
      modifierKeysRef.current = { ctrl: false, shift: false };
    };

    window.addEventListener("keydown", syncModifierKeys);
    window.addEventListener("keyup", syncModifierKeys);
    window.addEventListener("blur", resetModifierKeys);
    return () => {
      window.removeEventListener("keydown", syncModifierKeys);
      window.removeEventListener("keyup", syncModifierKeys);
      window.removeEventListener("blur", resetModifierKeys);
    };
  }, []);

  useEffect(() => {
    if (!isReady || !mapRef.current || !window.kakao?.maps) return;
    if (mapInstanceRef.current) return;

    const center = new window.kakao.maps.LatLng(
      DEFAULT_MAP_CENTER.lat,
      DEFAULT_MAP_CENTER.lng,
    );

    const mapContainer = mapRef.current;
    const map = new window.kakao.maps.Map(mapContainer, {
      center,
      level: DEFAULT_MAP_LEVEL,
      mapTypeId: window.kakao.maps.MapTypeId.HYBRID,
    });

    // 기본 휠 줌은 한 번에 여러 레벨이 건너뛰어질 수 있어, 1단계씩 세밀 조절한다
    map.setZoomable(false);
    let lastWheelZoomAt = 0;
    const WHEEL_ZOOM_THROTTLE_MS = 80;

    const handleWheelZoom = (event: WheelEvent) => {
      event.preventDefault();

      const now = Date.now();
      if (now - lastWheelZoomAt < WHEEL_ZOOM_THROTTLE_MS) return;
      lastWheelZoomAt = now;

      const direction = event.deltaY > 0 ? 1 : -1;
      const nextLevel = Math.min(
        MAX_MAP_LEVEL,
        Math.max(MIN_MAP_LEVEL, map.getLevel() + direction),
      );
      if (nextLevel === map.getLevel()) return;

      const rect = mapContainer.getBoundingClientRect();
      const point = new window.kakao.maps.Point(
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
      const anchor = map.getProjection().coordsFromContainerPoint(point);
      map.setLevel(nextLevel, { anchor, animate: true });
    };

    mapContainer.addEventListener("wheel", handleWheelZoom, {
      passive: false,
    });

    const clearRightClickOverlay = () => {
      rightClickOverlayRef.current?.setMap(null);
      rightClickOverlayRef.current = null;
    };

    window.kakao.maps.event.addListener(map, "click", () => {
      closeAllOverlays(overlaysRef.current);
      overlayOffsetsRef.current.clear();
      clearSelectedMarkers();
      clearRightClickOverlay();
    });

    // 우클릭한 위치의 주소를 역지오코딩해 팝업으로 표시한다.
    // 브라우저 기본 컨텍스트 메뉴는 막고, Kakao rightclick 좌표만 사용한다.
    mapContainer.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
    window.kakao.maps.event.addListener(
      map,
      "rightclick",
      (...args: unknown[]) => {
        const mouseEvent = args[0] as { latLng?: KakaoLatLng } | undefined;
        const latlng = mouseEvent?.latLng;
        if (!latlng || !window.kakao?.maps) return;

        const lat = latlng.getLat();
        const lng = latlng.getLng();

        clearRightClickOverlay();

        const overlay = new window.kakao.maps.CustomOverlay({
          position: latlng,
          content: createAddressLookupContent({
            lat,
            lng,
            status: "loading",
            onClose: clearRightClickOverlay,
          }),
          xAnchor: 0.5,
          yAnchor: 1,
          zIndex: 10000,
        });
        overlay.setMap(map);
        rightClickOverlayRef.current = overlay;

        import("@/features/map-marker/lib/geocode").then(
          async ({ reverseGeocode }) => {
            const result = await reverseGeocode(lat, lng);
            // 그새 팝업이 닫혔거나 다른 우클릭으로 교체됐으면 무시
            if (rightClickOverlayRef.current !== overlay) return;
            overlay.setContent(
              createAddressLookupContent({
                lat,
                lng,
                status: result ? "ok" : "fail",
                roadAddress: result?.roadAddress,
                jibunAddress: result?.jibunAddress,
                onClose: clearRightClickOverlay,
              }),
            );
          },
        );
      },
    );

    mapInstanceRef.current = map;
    setMapInstance(map);
    clustererRef.current = new window.kakao.maps.MarkerClusterer({
      map,
      averageCenter: true,
      minLevel: 6,
      // 커스텀 파이/도넛 아이콘이 기본 클릭 확대를 가로채므로 직접 처리한다
      disableClickZoom: true,
      styles: [
        {
          width: "48px",
          height: "48px",
          background: "transparent",
          borderRadius: "24px",
          color: "transparent",
          textAlign: "center",
          fontWeight: "bold",
          fontSize: "0",
          lineHeight: "48px",
        },
      ],
      texts: () => "",
    });

    const handleClusterClick = (cluster: KakaoCluster) => {
      zoomMapToCluster(map, cluster);
    };

    window.kakao.maps.event.addListener(
      clustererRef.current,
      "clusterclick",
      (...args: unknown[]) => {
        const cluster = args[0] as KakaoCluster | undefined;
        if (!cluster) return;
        handleClusterClick(cluster);
      },
    );

    window.kakao.maps.event.addListener(
      clustererRef.current,
      "clustered",
      (...args: unknown[]) => {
        const clusters = args[0] as KakaoCluster[] | undefined;
        if (!Array.isArray(clusters)) return;
        applyClusterPieStyles(clusters, clusterIconStyleRef.current, (cluster) =>
          zoomMapToCluster(map, cluster),
        );
      },
    );
  }, [isReady, clearSelectedMarkers]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const clusterer = clustererRef.current;
    if (!map || !window.kakao?.maps) return;

    closeAllOverlays(overlaysRef.current);

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];
    markerDataByIdRef.current = new Map();
    clusterer?.clear();

    const visibleMarkers = markers.filter((marker) => {
      if (
        mode === "equipment" &&
        isEquipmentSubMarker(marker as EquipmentMarker)
      ) {
        return false;
      }
      return markerPassesFilters(marker, mode, filters);
    });

    const markersToCluster: KakaoMarker[] = [];
    const plottedMarkers: MarkerRecord[] = [];

    visibleMarkers.forEach((data) => {
      if (!isPlottableCoordinate(data.lat, data.lng)) {
        return;
      }

      plottedMarkers.push(data);
      markerDataByIdRef.current.set(data.id, data);

      const position = new window.kakao.maps.LatLng(data.lat, data.lng);
      // 캡처 모드: 핀 대신 작은 동그라미만 표시
      const useCaptureDot = isInfoWindowCaptureMode;
      const markerWidth = useCaptureDot ? CAPTURE_DOT_SIZE : 30;
      const markerHeight = useCaptureDot ? CAPTURE_DOT_SIZE : 45;
      const markerImage = new window.kakao.maps.MarkerImage(
        getMarkerImageUri(data, mode, { captureDot: useCaptureDot }),
        new window.kakao.maps.Size(markerWidth, markerHeight),
        {
          offset: new window.kakao.maps.Point(
            markerWidth / 2,
            useCaptureDot ? markerHeight / 2 : markerHeight,
          ),
        },
      );

      const marker = new window.kakao.maps.Marker({
        position,
        title: data.name,
        image: markerImage,
        zIndex: 3,
        draggable: !useCaptureDot,
      });
      marker.markerId = data.id;
      marker.markerColor = getEffectiveMarkerColor(data, mode);

      window.kakao.maps.event.addListener(marker, "dragstart", () => {
        closeAllOverlays(overlaysRef.current);
      });

      window.kakao.maps.event.addListener(marker, "dragend", async () => {
        const newPos = marker.getPosition();
        const newLat = newPos.getLat();
        const newLng = newPos.getLng();

        // 위치 모드: 로그인/DB 없이 브라우저 메모리만 갱신
        if (mode === "location") {
          const confirmMove = window.confirm(
            `"${data.name}" 마커의 위치를 여기로 변경하시겠습니까?\n(위도: ${newLat.toFixed(6)}, 경도: ${newLng.toFixed(6)})`,
          );
          if (!confirmMove) {
            marker.setPosition(position);
            return;
          }

          updatePendingMarker("location", data.id, {
            lat: newLat,
            lng: newLng,
            address: "",
          });

          const { reverseGeocode } =
            await import("@/features/map-marker/lib/geocode");
          const geocoded = await reverseGeocode(newLat, newLng);
          updatePendingMarker("location", data.id, {
            lat: newLat,
            lng: newLng,
            address: geocoded?.address ?? "",
          });
          toast({
            description: `"${data.name}" 임시 위치가 변경되었습니다.`,
          });
          return;
        }

        if (!isAuthenticated) {
          alert("마커의 위치를 변경하려면 로그인이 필요합니다.");
          marker.setPosition(position);
          return;
        }

        const confirmMove = window.confirm(
          `"${data.name}" 마커의 위치를 여기로 변경하시겠습니까?\n(위도: ${newLat.toFixed(6)}, 경도: ${newLng.toFixed(6)})`,
        );

        if (confirmMove) {
          if (data.isPending) {
            updatePendingMarker(mode, data.id, { lat: newLat, lng: newLng });
            toast({
              description: `"${data.name}" 대기 마커의 임시 위치가 변경되었습니다.`,
            });
          } else {
            try {
              const tableName =
                mode === "battery" ? "battery_markers" : "markers";
              const { error } = await supabase
                .from(tableName)
                .update({ lat: newLat, lng: newLng })
                .eq("id", data.id);

              if (error) throw error;
              await queryClient.invalidateQueries({
                queryKey: MAP_MARKER_QUERY_KEY,
              });
            } catch (err: unknown) {
              const message =
                err instanceof Error ? err.message : "알 수 없는 오류";
              console.error("마커 위치 이동 실패:", err);
              alert(`마커 위치 저장 중 오류가 발생했습니다: ${message}`);
              marker.setPosition(position);
            }
          }
        } else {
          marker.setPosition(position);
        }
      });

      window.kakao.maps.event.addListener(
        marker,
        "click",
        (...args: unknown[]) => {
          const mouseEvent = args[0] as MouseEvent | undefined;
          const isMultiSelect = isMultiSelectGesture(
            mouseEvent,
            modifierKeysRef.current,
          );

          skipNextFocusRef.current = true;

          if (isMultiSelect) {
            toggleSelectedMarkerId(data.id);
            return;
          }

          setSelectedMarkerId(data.id);
        },
      );

      markersRef.current.push(marker);

      if (mode === "equipment" && isClusteringEnabled) {
        markersToCluster.push(marker);
      } else {
        marker.setMap(map);
      }
    });

    if (clusterer && mode === "equipment" && isClusteringEnabled) {
      clusterer.addMarkers(markersToCluster);
    }

    const shouldFitBatteryBounds =
      mode === "battery" &&
      plottedMarkers.length > 0 &&
      prevModeRef.current !== "battery";

    if (shouldFitBatteryBounds) {
      fitMapToMarkers(map, plottedMarkers);
    }
    prevModeRef.current = mode;
  }, [
    markers,
    mode,
    filters,
    isClusteringEnabled,
    isInfoWindowCaptureMode,
    queryClient,
    supabase,
    isAuthenticated,
    toast,
    setSelectedMarkerId,
    toggleSelectedMarkerId,
    updatePendingMarker,
  ]);

  useEffect(() => {
    const clusterer = clustererRef.current;
    if (!clusterer || !isClusteringEnabled || mode !== "equipment") return;
    clusterer.redraw();
  }, [clusterIconStyle, isClusteringEnabled, mode]);

  // 선택 상태에 맞춰 정보창(CustomOverlay)을 동기화한다
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.kakao?.maps) return;

    closeAllOverlays(overlaysRef.current);

    const selectedIdSet = new Set(selectedMarkerIds);
    Array.from(overlayOffsetsRef.current.keys()).forEach((markerId) => {
      if (!selectedIdSet.has(markerId)) {
        overlayOffsetsRef.current.delete(markerId);
      }
    });

    const disableDetailEdit = selectedMarkerIds.length > 1;

    // 정보창 위치는 항상 사용자가 드래그한 수동 오프셋을 사용한다.
    // (자동 배치를 쓰지 않고, 캡처 시에도 사용자가 옮긴 위치 그대로 촬영)

    // 위치 모드: 같은 지번의 국소명을 한 라벨에 모아 표시 (그룹당 오버레이 1개)
    const overlayTargets =
      mode === "location"
        ? pickLocationOverlayRepresentatives(selectedMarkerIds, markers)
        : selectedMarkerIds
            .map((markerId) => {
              const marker =
                markerDataByIdRef.current.get(markerId) ??
                markers.find((item) => item.id === markerId);
              return marker
                ? {
                    markerId,
                    marker,
                    groupNames: [marker.name],
                  }
                : null;
            })
            .filter(
              (
                item,
              ): item is {
                markerId: string;
                marker: MarkerRecord;
                groupNames: string[];
              } => item !== null,
            );

    overlayTargets.forEach(({ markerId, marker: data, groupNames }) => {
      const kakaoMarker = markersRef.current.find(
        (marker) => marker.markerId === markerId,
      );

      if (!kakaoMarker) return;

      const equipmentSubCount =
        mode === "equipment"
          ? markers.filter(
              (item) => (item as EquipmentMarker).parentMarkerId === data.id,
            ).length
          : 0;

      const resolvedGroupNames =
        mode === "location"
          ? groupNames.length > 0
            ? groupNames
            : collectLocationGroupNames(data, markers)
          : equipmentSubCount > 0
            ? [`${data.name} (+${equipmentSubCount})`]
            : undefined;

      // 캡처 모드에서는 정보창 대신 국소명 + 주소만 텍스트 라벨로 표시한다.
      const content = isInfoWindowCaptureMode
        ? createCaptureLabelContent(data, mode, resolvedGroupNames)
        : createOverlayContent(
            data,
            mode,
            () => {
              overlayOffsetsRef.current.delete(markerId);
              const currentIds = useMapMarkerStore.getState().selectedMarkerIds;
              if (currentIds.length <= 1) {
                clearSelectedMarkers();
                return;
              }
              toggleSelectedMarkerId(markerId);
            },
            (lat, lng, name) => openRoadview(lat, lng, name),
            (id) => openDetailModal(id),
            (id) => openEditModal(id),
            async (teamId, color) => {
              if (!supabase) return;
              try {
                const { error } = await supabase
                  .from("battery_markers")
                  .update({ facility_team: teamId || null, color })
                  .eq("id", data.id);
                if (error) throw error;
                await queryClient.invalidateQueries({
                  queryKey: MAP_MARKER_QUERY_KEY,
                });
              } catch (err) {
                console.error("시설팀 업데이트 실패:", err);
              }
            },
            isAuthenticated,
            disableDetailEdit,
            resolvedGroupNames,
          );

      // 오버레이 좌표는 항상 마커에 고정. 패널만 오프셋으로 이동한다.
      const overlay = new window.kakao.maps.CustomOverlay({
        content,
        position: kakaoMarker.getPosition(),
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 10,
      });

      overlay.setMap(map);
      overlaysRef.current.set(markerId, overlay);

      // 캡처든 아니든 항상 사용자가 드래그한 수동 위치를 사용한다
      const panelOffset =
        overlayOffsetsRef.current.get(markerId) ?? DEFAULT_OVERLAY_OFFSET;

      enableOverlayDrag({
        map,
        overlay,
        initialOffset: panelOffset,
        onOffsetChange: (offset) => {
          // 드래그한 위치를 저장한다 (캡처 시에도 이 위치를 그대로 사용)
          overlayOffsetsRef.current.set(markerId, offset);
        },
      });
    });
  }, [
    selectedMarkerIds,
    isInfoWindowCaptureMode,
    markers,
    mode,
    isAuthenticated,
    openDetailModal,
    openEditModal,
    openRoadview,
    clearSelectedMarkers,
    toggleSelectedMarkerId,
    queryClient,
    supabase,
  ]);

  // 캡처 패널이 타일마다 동기 호출할 수 있도록 재적용 함수를 등록한다.
  // 자동 배치는 하지 않고, 사용자가 드래그한 수동 위치를 다시 적용해 연결선만 맞춘다.
  useEffect(() => {
    const relayoutCaptureOverlays = () => {
      if (!useMapMarkerStore.getState().isInfoWindowCaptureMode) return;
      if (!window.kakao?.maps) return;

      overlaysRef.current.forEach((overlay, markerId) => {
        const content = overlay.getContent();
        if (!(content instanceof HTMLElement)) return;
        applyOverlayOffset(
          content,
          overlayOffsetsRef.current.get(markerId) ?? DEFAULT_OVERLAY_OFFSET,
        );
      });
    };

    registerCaptureOverlayLayoutRunner(relayoutCaptureOverlays);
    return () => registerCaptureOverlayLayoutRunner(null);
  }, []);

  // 캡처는 평상시 정보창 모양 그대로 촬영한다(확대 없음).
  // capture-readable 을 적용하지 않으므로 미리보기 크기 = 캡처 크기가 되어
  // 드래그한 위치가 그대로 유지된다.

  useEffect(() => {
    if (
      !selectedMarkerId ||
      !mapInstanceRef.current ||
      isDetailOpen ||
      isEditOpen ||
      selectedMarkerIds.length !== 1
    ) {
      return;
    }

    if (skipNextFocusRef.current) {
      skipNextFocusRef.current = false;
      return;
    }

    const kakaoMarker = markersRef.current.find(
      (marker) => marker.markerId === selectedMarkerId,
    );

    if (!kakaoMarker) return;

    if (mapInstanceRef.current.getLevel() > 3) {
      mapInstanceRef.current.setLevel(3);
    }
    mapInstanceRef.current.panTo(kakaoMarker.getPosition());
  }, [selectedMarkerId, selectedMarkerIds, isDetailOpen, isEditOpen, markers]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.kakao?.maps) return;

    if (isCadastralMode) {
      map.addOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
    } else {
      map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
    }
  }, [isCadastralMode, isReady]);

  // 장소 검색 결과의 필지 경계를 폴리곤으로 그리고, 검색 지점으로 이동한다.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.kakao?.maps) return;
    const kakao = window.kakao;

    // 이전 검색 오버레이 정리
    searchPolygonsRef.current.forEach((polygon) => polygon.setMap(null));
    searchPolygonsRef.current = [];
    if (searchMarkerRef.current) {
      searchMarkerRef.current.setMap(null);
      searchMarkerRef.current = null;
    }

    if (!placeSearch) return;

    const bounds = new kakao.maps.LatLngBounds();
    let boundsHasPoint = false;

    placeSearch.parcels.forEach((parcel) => {
      parcel.rings.forEach((ring) => {
        if (ring.length < 3) return;
        const path = ring.map((pt) => new kakao.maps.LatLng(pt.lat, pt.lng));
        const polygon = new kakao.maps.Polygon({
          path,
          strokeWeight: 3,
          strokeColor: "#ff2d78",
          strokeOpacity: 0.9,
          fillColor: "#ff2d78",
          fillOpacity: 0.12,
          zIndex: 4,
        });
        polygon.setMap(map);
        searchPolygonsRef.current.push(polygon);
        path.forEach((latlng) => {
          bounds.extend(latlng);
          boundsHasPoint = true;
        });
      });
    });

    const center = new kakao.maps.LatLng(
      placeSearch.center.lat,
      placeSearch.center.lng,
    );
    const marker = new kakao.maps.Marker({ position: center, zIndex: 5 });
    marker.setMap(map);
    searchMarkerRef.current = marker;

    if (boundsHasPoint) {
      bounds.extend(center);
      map.setBounds(bounds);
    } else {
      if (map.getLevel() > 3) map.setLevel(3);
      map.panTo(center);
    }
  }, [placeSearch, isReady]);

  useEffect(() => {
    return () => {
      searchPolygonsRef.current.forEach((polygon) => polygon.setMap(null));
      searchPolygonsRef.current = [];
      searchMarkerRef.current?.setMap(null);
      searchMarkerRef.current = null;
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 p-6">
        <div className="max-w-md space-y-3 text-center text-sm">
          <p className="font-medium text-rose-300">{error}</p>
          <ul className="space-y-1.5 text-left text-[12px] leading-relaxed text-slate-400">
            <li>
              1. 브라우저 주소가{" "}
              <span className="text-slate-200">http://localhost:3000</span> 인지
              확인 (3001·IP 주소면 Kakao 콘솔에 해당 도메인도 등록)
            </li>
            <li>
              2. Kakao Developers → 앱 → 플랫폼(Web)에 localhost:3000 등록
            </li>
            <li>
              3. 광고 차단/프라이버시 확장을 끄고 F12 → Network에서{" "}
              <span className="text-slate-200">sdk.js</span> 상태 확인
            </li>
            <li>
              4. `.env.local`의 키가{" "}
              <span className="text-slate-200">JavaScript 키</span>인지 확인 후
              dev 서버 재시작
            </li>
          </ul>
          <button
            type="button"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700"
            onClick={retry}
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full" />
      {!isReady ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-sm text-slate-300">
          지도 로딩 중...
        </div>
      ) : null}
      {isRegionSelectMode ? (
        <MapRegionSelectOverlay
          onCancel={() => setIsRegionSelectMode(false)}
          onComplete={(rect) => {
            const map = mapInstanceRef.current;
            const container = mapRef.current;
            if (!map || !container) return;

            try {
              const bounds = screenRectToMapBounds(
                map,
                container,
                rect.clientX1,
                rect.clientY1,
                rect.clientX2,
                rect.clientY2,
              );
              setCaptureBounds(bounds);
              setIsRegionSelectMode(false);
              setIsCapturePanelOpen(true);
            } catch (err) {
              console.error("영역 변환 실패:", err);
              toast({
                description: "선택한 영역을 지도 좌표로 변환하지 못했습니다.",
                variant: "destructive",
              });
              setIsRegionSelectMode(false);
            }
          }}
        />
      ) : null}
      {captureBounds && mapInstance && isCapturePanelOpen ? (
        <MapRegionBoundsGuide
          map={mapInstance}
          bounds={captureBounds}
          plan={captureGuide.plan}
          viewportSpan={captureGuide.viewportSpan}
          capturedCount={captureGuide.capturedCount}
          excludedIndices={excludedTiles}
          onToggleTile={handleToggleExcludedTile}
          interactive={captureGuide.capturedCount === 0}
        />
      ) : null}
      <MapFloatingControls
        map={mapInstance}
        onStartRegionCapture={() => {
          setIsCapturePanelOpen(false);
          setCaptureBounds(null);
          setExcludedTiles(new Set());
          prevTileCountRef.current = 0;
          setCaptureGuide({
            plan: null,
            viewportSpan: null,
            capturedCount: 0,
          });
          setIsRegionSelectMode(true);
        }}
      />
      {isCapturePanelOpen && mapInstance && mapRef.current && captureBounds ? (
        <MapRegionCapturePanel
          map={mapInstance}
          mapContainer={mapRef.current}
          bounds={captureBounds}
          markers={markers.filter((marker) => {
            if (
              mode === "equipment" &&
              isEquipmentSubMarker(marker as EquipmentMarker)
            ) {
              return false;
            }
            return (
              markerPassesFilters(marker, mode, filters) &&
              isPlottableCoordinate(marker.lat, marker.lng)
            );
          })}
          excludedTiles={excludedTiles}
          onGuideChange={handleCaptureGuideChange}
          onClose={() => {
            setIsCapturePanelOpen(false);
            setCaptureBounds(null);
            setExcludedTiles(new Set());
            prevTileCountRef.current = 0;
            setCaptureGuide({
              plan: null,
              viewportSpan: null,
              capturedCount: 0,
            });
          }}
          onReselectRegion={() => {
            setIsCapturePanelOpen(false);
            setCaptureBounds(null);
            setExcludedTiles(new Set());
            prevTileCountRef.current = 0;
            setCaptureGuide({
              plan: null,
              viewportSpan: null,
              capturedCount: 0,
            });
            setIsRegionSelectMode(true);
          }}
        />
      ) : null}
    </div>
  );
}
