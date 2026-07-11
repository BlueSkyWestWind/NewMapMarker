"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_LEVEL,
  MAP_MARKER_QUERY_KEY,
} from "@/features/map-marker/constants/map-config";
import { markerPassesFilters } from "@/features/map-marker/lib/marker-filters";
import {
  applyClusterPieStyles,
  type ClusterIconStyle,
} from "@/features/map-marker/lib/cluster-pie";
import {
  getEffectiveMarkerColor,
  getMarkerImageUri,
} from "@/features/map-marker/lib/marker-svg";
import { useKakaoMapSdk } from "@/features/map-marker/hooks/use-kakao-map-sdk";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import type {
  MapMode,
  MarkerFilterState,
  MarkerRecord,
  EquipmentMarker,
  BatteryMarker,
} from "@/features/map-marker/types/marker";
import { MapFloatingControls } from "@/features/map-marker/components/map/map-floating-controls";
import { useToast } from "@/hooks/use-toast";

interface KakaoMapCanvasProps {
  markers: MarkerRecord[];
  mode: MapMode;
  filters: MarkerFilterState;
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

export function KakaoMapCanvas({
  markers,
  mode,
  filters,
}: KakaoMapCanvasProps) {
  const { supabase, isAuthenticated } = useAuthSession();
  const queryClient = useQueryClient();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<KakaoMap | null>(null);
  const clustererRef = useRef<KakaoMarkerClusterer | null>(null);
  const markersRef = useRef<KakaoMarker[]>([]);
  const activeOverlayRef = useRef<any>(null);
  const { isReady, error } = useKakaoMapSdk();

  const isClusteringEnabled = useMapMarkerStore(
    (state) => state.isClusteringEnabled,
  );
  const clusterIconStyle = useMapMarkerStore((state) => state.clusterIconStyle);
  const isCadastralMode = useMapMarkerStore((state) => state.isCadastralMode);
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
  const selectedMarkerId = useMapMarkerStore((state) => state.selectedMarkerId);
  const isDetailOpen = useMapMarkerStore((state) => state.isDetailOpen);
  const isEditOpen = useMapMarkerStore((state) => state.isEditOpen);
  const { toast } = useToast();

  const prevModeRef = useRef<MapMode | null>(null);

  useEffect(() => {
    if (!isReady || !mapRef.current || !window.kakao?.maps) return;
    if (mapInstanceRef.current) return;

    const center = new window.kakao.maps.LatLng(
      DEFAULT_MAP_CENTER.lat,
      DEFAULT_MAP_CENTER.lng,
    );

    const map = new window.kakao.maps.Map(mapRef.current, {
      center,
      level: DEFAULT_MAP_LEVEL,
      mapTypeId: window.kakao.maps.MapTypeId.HYBRID,
    });

    // 지도 클릭 시 열려있는 커스텀 오버레이 닫기
    window.kakao.maps.event.addListener(map, "click", () => {
      if (activeOverlayRef.current) {
        activeOverlayRef.current.setMap(null);
        activeOverlayRef.current = null;
      }
      setSelectedMarkerId(null);
    });

    mapInstanceRef.current = map;
    clustererRef.current = new window.kakao.maps.MarkerClusterer({
      map,
      averageCenter: true,
      minLevel: 6,
      disableClickZoom: false,
      // 실제 아이콘은 clustered 이벤트에서 파이/도넛으로 교체한다
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

    window.kakao.maps.event.addListener(
      clustererRef.current,
      "clustered",
      (...args: unknown[]) => {
        const clusters = args[0] as KakaoCluster[] | undefined;
        if (!Array.isArray(clusters)) return;
        applyClusterPieStyles(clusters, clusterIconStyleRef.current);
      },
    );
  }, [isReady]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const clusterer = clustererRef.current;
    if (!map || !window.kakao?.maps) return;

    // 필터/모드 변경 시 열려있는 오버레이 닫기
    if (activeOverlayRef.current) {
      activeOverlayRef.current.setMap(null);
      activeOverlayRef.current = null;
    }

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];
    clusterer?.clear();

    const visibleMarkers = markers.filter((marker) =>
      markerPassesFilters(marker, mode, filters),
    );

    const markersToCluster: KakaoMarker[] = [];
    const plottedMarkers: MarkerRecord[] = [];

    visibleMarkers.forEach((data) => {
      if (!isPlottableCoordinate(data.lat, data.lng)) {
        return;
      }

      plottedMarkers.push(data);

      const position = new window.kakao.maps.LatLng(data.lat, data.lng);
      const markerImage = new window.kakao.maps.MarkerImage(
        getMarkerImageUri(data, mode),
        new window.kakao.maps.Size(30, 45),
        { offset: new window.kakao.maps.Point(15, 45) },
      );

      const marker = new window.kakao.maps.Marker({
        position,
        title: data.name,
        image: markerImage,
        zIndex: 3,
        draggable: true,
      });
      (
        marker as KakaoMarker & { markerId?: string; markerColor?: string }
      ).markerId = data.id;
      (
        marker as KakaoMarker & { markerId?: string; markerColor?: string }
      ).markerColor = getEffectiveMarkerColor(data, mode);

      window.kakao.maps.event.addListener(marker, "dragstart", () => {
        if (activeOverlayRef.current) {
          activeOverlayRef.current.setMap(null);
          activeOverlayRef.current = null;
        }
      });

      window.kakao.maps.event.addListener(marker, "dragend", async () => {
        const newPos = marker.getPosition();
        const newLat = newPos.getLat();
        const newLng = newPos.getLng();

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
            } catch (err: any) {
              console.error("마커 위치 이동 실패:", err);
              alert(`마커 위치 저장 중 오류가 발생했습니다: ${err.message}`);
              marker.setPosition(position);
            }
          }
        } else {
          marker.setPosition(position);
        }
      });

      // 마커 클릭 시 정보창(CustomOverlay) 표시
      window.kakao.maps.event.addListener(marker, "click", () => {
        if (activeOverlayRef.current) {
          activeOverlayRef.current.setMap(null);
        }

        const content = createOverlayContent(
          data,
          mode,
          () => {
            if (activeOverlayRef.current) {
              activeOverlayRef.current.setMap(null);
              activeOverlayRef.current = null;
            }
            setSelectedMarkerId(null);
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
        );

        const overlay = new window.kakao.maps.CustomOverlay({
          content,
          position: marker.getPosition(),
          yAnchor: 1.15,
          zIndex: 10,
        });

        overlay.setMap(map);
        activeOverlayRef.current = overlay;
      });

      markersRef.current.push(marker);

      if (mode === "battery" || !isClusteringEnabled) {
        marker.setMap(map);
      } else {
        markersToCluster.push(marker);
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
    openDetailModal,
    openEditModal,
    openRoadview,
    queryClient,
    supabase,
    isAuthenticated,
    toast,
    setSelectedMarkerId,
    updatePendingMarker,
  ]);

  useEffect(() => {
    const clusterer = clustererRef.current;
    if (!clusterer || !isClusteringEnabled || mode !== "equipment") return;
    clusterer.redraw();
  }, [clusterIconStyle, isClusteringEnabled, mode]);

  useEffect(() => {
    if (
      !selectedMarkerId ||
      !mapInstanceRef.current ||
      isDetailOpen ||
      isEditOpen
    )
      return;

    // markersRef.current에서 해당 ID를 가진 카카오 마커 찾기
    const kakaoMarker = markersRef.current.find(
      (m: any) => m.markerId === selectedMarkerId,
    );

    if (kakaoMarker) {
      // 마커로 확대 (기존 줌 레벨이 3보다 크면 3으로 축소/확대)
      if (mapInstanceRef.current.getLevel() > 3) {
        mapInstanceRef.current.setLevel(3);
      }
      mapInstanceRef.current.panTo(kakaoMarker.getPosition());
      (window.kakao.maps.event as any).trigger(kakaoMarker, "click");
    }
  }, [selectedMarkerId, isDetailOpen, isEditOpen, markers]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.kakao?.maps) return;

    if (isCadastralMode) {
      map.addOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
    } else {
      map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
    }
  }, [isCadastralMode, isReady]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 p-6 text-center text-sm text-rose-300">
        {error}
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
      <MapFloatingControls map={mapInstanceRef.current} />
    </div>
  );
}

function formatJibunAddress(addr: string | null | undefined): string {
  if (!addr) return "";
  const trimmed = addr.trim();
  if (trimmed.endsWith("번지")) return trimmed;
  if (/\d$/.test(trimmed)) {
    return trimmed + "번지";
  }
  return trimmed;
}

function createOverlayContent(
  data: MarkerRecord,
  mode: MapMode,
  onClose: () => void,
  onRoadview: (lat: number, lng: number, name: string) => void,
  onDetail: (id: string) => void,
  onEdit: (id: string) => void,
  onTeamChange: (teamId: string, color: string) => Promise<void>,
  isAuthenticated: boolean,
): HTMLDivElement {
  const container = document.createElement("div");
  container.className = "custom-overlay";

  const stopPropagation = (e: Event) => e.stopPropagation();
  container.addEventListener("click", stopPropagation);
  container.addEventListener("mousedown", stopPropagation);
  container.addEventListener("mouseup", stopPropagation);
  container.addEventListener("touchstart", stopPropagation);
  container.addEventListener("touchend", stopPropagation);

  const header = document.createElement("div");
  header.className = "overlay-header";

  const title = document.createElement("div");
  title.className = "overlay-title";
  title.textContent = data.name;

  const closeBtn = document.createElement("span");
  closeBtn.className = "overlay-close";
  closeBtn.innerHTML = "&#x2715;"; // X 아이콘
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClose();
  });

  header.appendChild(title);
  header.appendChild(closeBtn);
  container.appendChild(header);

  // 주소 표시 영역
  const addressDiv = document.createElement("div");
  addressDiv.className = "overlay-address";

  const jibun =
    mode === "equipment" ? (data as EquipmentMarker).jibunAddress : "";
  const road =
    mode === "equipment"
      ? (data as EquipmentMarker).roadAddress
      : (data as BatteryMarker).address;

  if (jibun || road) {
    let html = "";
    if (jibun) {
      html += `<span class="road-addr font-medium">${formatJibunAddress(jibun)}</span>`;
    }
    if (road) {
      html += `<span class="jibun-addr text-[10px] opacity-75" style="display: block; margin-top: 2px;">(도로명) ${road}</span>`;
    }
    addressDiv.innerHTML = html;
  } else {
    addressDiv.innerHTML = '<span class="road-addr">주소 조회 중...</span>';
    if (window.kakao?.maps?.services?.Geocoder) {
      const geocoder = new window.kakao.maps.services.Geocoder();
      const coord = new window.kakao.maps.LatLng(data.lat, data.lng);
      geocoder.coord2Address(
        coord.getLng(),
        coord.getLat(),
        (result: any, status: any) => {
          if (
            status === window.kakao.maps.services.Status.OK &&
            result.length > 0
          ) {
            const roadAddr = result[0].road_address?.address_name || "";
            const jibunAddr = result[0].address?.address_name || "";

            let html = "";
            if (jibunAddr) {
              html += `<span class="road-addr font-medium">${formatJibunAddress(jibunAddr)}</span>`;
            }
            if (roadAddr) {
              html += `<span class="jibun-addr text-[10px] opacity-75" style="display: block; margin-top: 2px;">(도로명) ${roadAddr}</span>`;
            }
            if (!roadAddr && !jibunAddr) {
              html = '<span class="road-addr">주소 없음</span>';
            }
            addressDiv.innerHTML = html;
          } else {
            addressDiv.innerHTML =
              '<span class="road-addr">주소 조회 실패</span>';
          }
        },
      );
    }
  }

  // 축전지 사양 요약 노출
  if (mode === "battery") {
    const bat = data as BatteryMarker;
    const specSummary = document.createElement("div");
    specSummary.className =
      "text-[10px] text-emerald-400 mt-1 flex flex-col gap-0.5";

    if (bat.items && bat.items.length > 0) {
      const capGroups: { [key: number]: number } = {};
      bat.items.forEach((item) => {
        const cap = Number(item.capacity || 0);
        const qty = Number(item.quantity || 0);
        capGroups[cap] = (capGroups[cap] || 0) + qty;
      });
      const sortedCapacities = Object.keys(capGroups)
        .map(Number)
        .sort((a, b) => b - a);
      const parts = sortedCapacities.map(
        (cap) => `${cap}AH / ${capGroups[cap]}Cell`,
      );

      specSummary.innerHTML = `
        <div class="flex flex-col gap-0.5">
          ${parts.map((part) => `<div>• ${part}</div>`).join("")}
        </div>
      `;
    } else {
      specSummary.innerHTML = `
        <div>• ${bat.capacity}AH / ${bat.quantity}Cell</div>
      `;
    }

    addressDiv.appendChild(specSummary);

    // 시설팀 선택 드롭다운 UI 추가
    const teamSelectContainer = document.createElement("div");
    teamSelectContainer.className =
      "flex items-center gap-1.5 mt-2 text-[10px] text-slate-300";
    teamSelectContainer.style.display = "flex";
    teamSelectContainer.style.alignItems = "center";
    teamSelectContainer.style.marginTop = "6px";

    const label = document.createElement("span");
    label.textContent = "시설팀:";
    teamSelectContainer.appendChild(label);

    const select = document.createElement("select");
    select.className =
      "bg-slate-800 text-slate-100 border border-slate-700 rounded px-1 py-0.5 text-[10px] focus:outline-none cursor-pointer";
    select.style.backgroundColor = "#1e293b";
    select.style.color = "#f1f5f9";
    select.style.border = "1px solid #334155";
    select.style.borderRadius = "4px";
    select.style.padding = "2px 4px";
    if (!isAuthenticated) {
      select.disabled = true;
      select.style.cursor = "not-allowed";
      select.style.opacity = "0.7";
    }

    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "미지정";
    if (!bat.facilityTeam) defaultOpt.selected = true;
    select.appendChild(defaultOpt);

    const teams = [
      { id: "1", label: "1팀(박경훈)" },
      { id: "2", label: "2팀(김정배)" },
      { id: "3", label: "3팀(정종연)" },
      { id: "4", label: "4팀(이동화)" },
      { id: "5", label: "5팀(김영남)" },
      { id: "7", label: "7팀(김성범)" },
    ];

    teams.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.label;
      if (bat.facilityTeam === t.id) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    select.addEventListener("change", async (e) => {
      const target = e.target as HTMLSelectElement;
      const teamId = target.value;
      const teamColors: Record<string, string> = {
        "1": "#2563eb",
        "2": "#d946ef",
        "3": "#84cc16",
        "4": "#9333ea",
        "5": "#ea580c",
        "7": "#0891b2",
      };
      const color = teamColors[teamId] || "#64748b";

      select.disabled = true;
      try {
        await onTeamChange(teamId, color);
      } finally {
        select.disabled = false;
      }
    });

    teamSelectContainer.appendChild(select);
    addressDiv.appendChild(teamSelectContainer);
  }

  container.appendChild(addressDiv);

  const actions = document.createElement("div");
  actions.className = "overlay-actions";

  // 로드뷰 버튼
  const roadviewBtn = document.createElement("button");
  roadviewBtn.className = "overlay-btn overlay-btn-roadview";
  roadviewBtn.textContent = "로드뷰";
  roadviewBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onRoadview(data.lat, data.lng, data.name);
  });
  actions.appendChild(roadviewBtn);

  // 상세 버튼
  const detailBtn = document.createElement("button");
  detailBtn.className = "overlay-btn overlay-btn-detail";
  detailBtn.textContent = "상세";
  detailBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onDetail(data.id);
  });
  actions.appendChild(detailBtn);

  // 편집 버튼
  if (isAuthenticated) {
    const editBtn = document.createElement("button");
    editBtn.className = "overlay-btn overlay-btn-edit";
    editBtn.textContent = "편집";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onEdit(data.id);
    });
    actions.appendChild(editBtn);
  }

  container.appendChild(actions);
  return container;
}
