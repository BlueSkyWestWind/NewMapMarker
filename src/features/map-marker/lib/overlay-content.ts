import type {
  BatteryMarker,
  EquipmentMarker,
  LocationMarker,
  MapMode,
  MarkerRecord,
} from "@/features/map-marker/types/marker";
import { fetchWorksiteWeather } from "@/features/worksite-weather/lib/worksite-weather-api";
import {
  VERDICT_ICON,
  VERDICT_LABEL,
  VERDICT_TONE,
  type SiteMatch,
  type WorksiteWeatherResponse,
} from "@/features/worksite-weather/types/weather";

function getOverlayAddressParts(data: MarkerRecord, mode: MapMode) {
  if (mode === "equipment") {
    const equipment = data as EquipmentMarker;
    return {
      jibun: equipment.jibunAddress,
      road: equipment.roadAddress,
    };
  }

  if (mode === "battery") {
    return {
      jibun: "",
      road: (data as BatteryMarker).address,
    };
  }

  return {
    jibun: (data as LocationMarker).address,
    road: "",
  };
}

/**
 * 지도 정보창(CustomOverlay)용 DOM 콘텐츠 빌더.
 * kakao-map-canvas 에서 분리 — 순수 DOM 생성 함수(컴포넌트 상태 비의존).
 */

function formatJibunAddress(addr: string | null | undefined): string {
  if (!addr) return "";
  const trimmed = addr.trim();
  if (trimmed.endsWith("번지")) return trimmed;
  if (/\d$/.test(trimmed)) {
    return trimmed + "번지";
  }
  return trimmed;
}

/** 위치 모드는 도로명/지번 혼합 주소라 번지 보정을 하지 않는다. */
function formatPrimaryAddress(addr: string, mode: MapMode) {
  if (mode === "location") return addr;
  return formatJibunAddress(addr);
}

/**
 * 국소명 목록을 주소 위쪽에 쌓아 표시한다.
 * DOM 순서는 아래에서 위(column-reverse)로, 추가 국소명이 위로 올라간다.
 */
function createStackedTitleElement(names: string[]): HTMLDivElement {
  const title = document.createElement("div");
  title.className = "overlay-title";

  const uniqueNames = names.map((name) => name.trim()).filter(Boolean);
  if (uniqueNames.length <= 1) {
    title.textContent = uniqueNames[0] ?? "";
    return title;
  }

  title.classList.add("overlay-title-stack");
  uniqueNames.forEach((name) => {
    const line = document.createElement("div");
    line.className = "overlay-title-line";
    line.textContent = name;
    title.appendChild(line);
  });

  return title;
}

/** innerHTML 삽입 전 문자열을 이스케이프해 XSS를 방지한다. */
function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 판정 아이콘·라벨·색은 types/weather.ts가 단일 소스다.
// 여기서 다시 정의하면 같은 등급이 지도와 사이드바에서 다른 이름으로 보인다.

function formatAlertIssuedAt(raw?: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/\D/g, "");
  if (cleaned.length < 8) return "";

  const month = parseInt(cleaned.slice(4, 6), 10);
  const day = parseInt(cleaned.slice(6, 8), 10);
  const hour = cleaned.length >= 10 ? parseInt(cleaned.slice(8, 10), 10) : 0;

  if (!month || !day) return "";

  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();

  // 오늘 발효된 경우: "오늘 11시"
  if (month === todayMonth && day === todayDay) {
    return `오늘 ${hour}시`;
  }

  // 이전에 발효되어 지속 중인 경우: "7/22부터 발효"
  return `${month}/${day}부터 발효`;
}

function renderWeatherBoxContent(
  container: HTMLDivElement,
  weather: WorksiteWeatherResponse,
) {
  const currentHour = new Date().getHours();
  const currentSlot =
    weather.timeline.find((s) => parseInt(s.time.slice(0, 2), 10) === currentHour) ??
    weather.timeline.find((s) => parseInt(s.time.slice(0, 2), 10) >= currentHour) ??
    weather.timeline[0];

  const overallIcon = VERDICT_ICON[weather.overall] ?? "⚪";
  const overallLabel = VERDICT_LABEL[weather.overall] ?? "정보없음";
  const overallBg =
    VERDICT_TONE[weather.overall] ?? "bg-slate-800 border-slate-700 text-slate-200";

  const recText =
    weather.recommendedWindows.length > 0
      ? "권장 " + weather.recommendedWindows.map((w) => `${w.from}~${w.to}시`).join(", ")
      : "권장 시간대 없음";

  const alertItems = Array.from(
    new Map(
      weather.alerts.map((a) => {
        const key = `${a.type}${a.level}`;
        const timeStr = formatAlertIssuedAt(a.issuedAt);
        const label = timeStr ? `${a.type}${a.level}(${timeStr})` : `${a.type}${a.level}`;
        return [key, label];
      }),
    ).values(),
  );
  const alertsText = alertItems.length > 0 ? alertItems.join(", ") : null;

  let slotText = "";
  if (currentSlot) {
    const hourLabel = `${currentSlot.time.slice(0, 2)}시`;
    const tempText =
      currentSlot.temp == null
        ? "-"
        : currentSlot.apparent != null
          ? `${currentSlot.temp}° / ${currentSlot.apparent}°`
          : `${currentSlot.temp}°`;
    const humidityText = currentSlot.humidity != null ? `${currentSlot.humidity}%` : "-";
    const windText =
      currentSlot.windDir && currentSlot.windSpeed != null
        ? `${currentSlot.windDir} ${currentSlot.windSpeed.toFixed(1)}`
        : "-";
    const rainText = currentSlot.pop != null ? `${currentSlot.pop}%` : "-";
    const slotIcon = VERDICT_ICON[currentSlot.verdict] ?? "⚪";

    slotText = `
      <div class="rounded-lg bg-slate-900/90 p-2 border border-slate-700/70 shadow-inner space-y-1">
        <div class="grid grid-cols-6 text-center text-[10px] font-semibold text-slate-400 pb-1 border-b border-slate-800">
          <div>시각</div>
          <div>기온/체감</div>
          <div>습도</div>
          <div>바람</div>
          <div>강수</div>
          <div>판정</div>
        </div>
        <div class="grid grid-cols-6 text-center text-[11px] font-medium text-slate-100 items-center tabular-nums">
          <div class="font-bold text-sky-300">${hourLabel}</div>
          <div>${tempText}</div>
          <div>${humidityText}</div>
          <div class="text-[10px]">${windText}</div>
          <div>${rainText}</div>
          <div>${slotIcon}</div>
        </div>
      </div>
    `;
  }

  container.className =
    "overlay-card overlay-weather-card text-xs text-slate-100 space-y-2";
  container.innerHTML = `
    ${slotText}
    <div class="rounded-lg border px-3 py-2 space-y-1.5 break-keep ${overallBg}">
      <div class="flex items-center justify-between text-[11px] font-bold">
        <span class="flex items-center gap-1">${overallIcon} ${overallLabel}</span>
        <span class="text-[10px] font-normal opacity-90">${escapeHtml(recText)}</span>
      </div>
      ${
        alertsText
          ? `<div class="border-t border-slate-700/50 pt-1.5 text-[10px] leading-relaxed opacity-95 text-left break-keep">
              발효 특보: ${escapeHtml(alertsText)}
             </div>`
          : ""
      }
    </div>
  `;
}

export function createOverlayContent(
  data: MarkerRecord,
  mode: MapMode,
  onClose: () => void,
  onRoadview: (lat: number, lng: number, name: string) => void,
  onDetail: (id: string) => void,
  onEdit: (id: string) => void,
  onTeamChange: (teamId: string, color: string) => Promise<void>,
  isAuthenticated: boolean,
  disableDetailEdit: boolean,
  groupNames?: string[],
): HTMLDivElement {
  const root = document.createElement("div");
  root.className = "overlay-root";

  const stem = document.createElement("div");
  stem.className = "overlay-stem";

  const anchor = document.createElement("div");
  anchor.className = "overlay-anchor";

  const container = document.createElement("div");
  container.className = "custom-overlay";

  const pointer = document.createElement("div");
  pointer.className = "overlay-pointer";
  container.appendChild(pointer);

  // 1. 날씨 탭(weather 모드)일 때만 상단에 독립된 날씨 카드 박스를 노출한다
  if (mode === "weather") {
    const weatherCard = document.createElement("div");
    weatherCard.className =
      "overlay-card overlay-weather-card text-xs text-slate-100 space-y-1.5";
    weatherCard.innerHTML =
      '<div class="flex items-center gap-1.5 text-[11px] text-slate-400 py-0.5"><span class="animate-pulse">⛅</span><span>현재 시각 날씨 조회 중...</span></div>';
    container.appendChild(weatherCard);

    // 기상 정보 비동기 호출
    const rawAddr =
      (data as EquipmentMarker).roadAddress ||
      (data as EquipmentMarker).jibunAddress ||
      (data as LocationMarker).address ||
      "";
    const siteMatch: SiteMatch = {
      id: data.id,
      name: data.name,
      address: rawAddr,
      lat: data.lat,
      lng: data.lng,
      workType: (data as EquipmentMarker).workType === "elevated" ? "elevated" : "ground",
      matchedBy: "name",
    };

    // 오버레이가 닫힌 뒤 응답이 와도 떨어져 나간 DOM을 갱신하지 않는다
    const isStillMounted = () => weatherCard.isConnected;

    fetchWorksiteWeather(siteMatch)
      .then((weatherData) => {
        if (!isStillMounted()) return;
        renderWeatherBoxContent(weatherCard, weatherData);
      })
      .catch(() => {
        if (!isStillMounted()) return;
        weatherCard.innerHTML =
          '<div class="text-[10px] text-slate-400 py-0.5">기상 정보를 불러오지 못했습니다.</div>';
      });
  }

  // 2. 마커 정보 전용 카드 박스
  const infoCard = document.createElement("div");
  infoCard.className = "overlay-card overlay-info-card";
  container.appendChild(infoCard);

  // mouseup/pointerup 은 막지 않는다 — 정보창 드래그 종료 이벤트가 끊기면
  // 지도가 드래그 불가 상태로 남는 문제가 발생한다
  const stopPropagation = (e: Event) => e.stopPropagation();
  root.addEventListener("click", stopPropagation);
  root.addEventListener("mousedown", stopPropagation);
  root.addEventListener("touchstart", stopPropagation);

  const header = document.createElement("div");
  header.className = "overlay-header";

  const titleNames =
    mode === "location" && groupNames && groupNames.length > 0
      ? groupNames
      : [data.name];
  const title = createStackedTitleElement(titleNames);

  const closeBtn = document.createElement("span");
  closeBtn.className = "overlay-close";
  closeBtn.innerHTML = "&#x2715;";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClose();
  });

  header.appendChild(title);
  header.appendChild(closeBtn);
  infoCard.appendChild(header);

  const addressDiv = document.createElement("div");
  addressDiv.className = "overlay-address";

  const { jibun, road } = getOverlayAddressParts(data, mode);

  if (jibun || road) {
    let html = "";
    if (jibun) {
      html += `<span class="road-addr font-medium">${escapeHtml(formatPrimaryAddress(jibun, mode))}</span>`;
    }
    if (road) {
      html += `<span class="jibun-addr text-[10px] opacity-75" style="display: block; margin-top: 2px;">(도로명) ${escapeHtml(road)}</span>`;
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
        (result: unknown[], status: string) => {
          const addressResult = result[0] as
            | {
                road_address?: { address_name?: string };
                address?: { address_name?: string };
              }
            | undefined;

          if (
            status === window.kakao?.maps.services.Status.OK &&
            addressResult
          ) {
            const roadAddr = addressResult.road_address?.address_name || "";
            const jibunAddr = addressResult.address?.address_name || "";

            let html = "";
            if (jibunAddr) {
              html += `<span class="road-addr font-medium">${escapeHtml(formatPrimaryAddress(jibunAddr, mode))}</span>`;
            }
            if (roadAddr) {
              html += `<span class="jibun-addr text-[10px] opacity-75" style="display: block; margin-top: 2px;">(도로명) ${escapeHtml(roadAddr)}</span>`;
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
        <div>• ${escapeHtml(bat.capacity)}AH / ${escapeHtml(bat.quantity)}Cell</div>
      `;
    }

    addressDiv.appendChild(specSummary);

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

  infoCard.appendChild(addressDiv);

  const actions = document.createElement("div");
  actions.className = "overlay-actions";

  const roadviewBtn = document.createElement("button");
  roadviewBtn.className = "overlay-btn overlay-btn-roadview";
  roadviewBtn.textContent = "로드뷰";
  roadviewBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onRoadview(data.lat, data.lng, data.name);
  });
  actions.appendChild(roadviewBtn);

  // 위치 모드는 임시 확인용이라 상세/편집 없이 로드뷰만 제공한다.
  if (mode !== "location") {
    const detailBtn = document.createElement("button");
    detailBtn.className = "overlay-btn overlay-btn-detail";
    detailBtn.textContent = "상세";
    detailBtn.disabled = disableDetailEdit;
    detailBtn.title = disableDetailEdit
      ? "다중 선택 중에는 상세를 사용할 수 없습니다"
      : "상세 정보";
    detailBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (disableDetailEdit) return;
      onDetail(data.id);
    });
    actions.appendChild(detailBtn);

    if (isAuthenticated) {
      const editBtn = document.createElement("button");
      editBtn.className = "overlay-btn overlay-btn-edit";
      editBtn.textContent = "편집";
      editBtn.disabled = disableDetailEdit;
      editBtn.title = disableDetailEdit
        ? "다중 선택 중에는 편집을 사용할 수 없습니다"
        : "편집";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (disableDetailEdit) return;
        onEdit(data.id);
      });
      actions.appendChild(editBtn);
    }
  }

  infoCard.appendChild(actions);

  root.appendChild(stem);
  root.appendChild(anchor);
  root.appendChild(container);
  return root;
}

/**
 * 캡처용 텍스트 라벨: 정보창(버튼/닫기 등) 없이 국소명 + 주소만 텍스트로 표시한다.
 * 드래그 위치 조정을 위해 overlay-header/custom-overlay 구조는 유지하되,
 * 연결선(stem)·삼각형(pointer)은 숨긴다.
 */
export function createCaptureLabelContent(
  data: MarkerRecord,
  mode: MapMode,
  groupNames?: string[],
): HTMLDivElement {
  const root = document.createElement("div");
  root.className = "overlay-root";

  const stem = document.createElement("div");
  stem.className = "overlay-stem";
  stem.style.display = "none";

  const anchor = document.createElement("div");
  anchor.className = "overlay-anchor";

  const container = document.createElement("div");
  container.className = "custom-overlay text-label";

  const pointer = document.createElement("div");
  pointer.className = "overlay-pointer";
  pointer.style.display = "none";
  container.appendChild(pointer);

  const stopPropagation = (e: Event) => e.stopPropagation();
  root.addEventListener("click", stopPropagation);
  root.addEventListener("mousedown", stopPropagation);
  root.addEventListener("touchstart", stopPropagation);

  // 국소명 (드래그 핸들 역할) — 같은 지번이면 위쪽으로 쌓아 표시
  const header = document.createElement("div");
  header.className = "overlay-header";

  const titleNames =
    mode === "location" && groupNames && groupNames.length > 0
      ? groupNames
      : [data.name];
  header.appendChild(createStackedTitleElement(titleNames));
  container.appendChild(header);

  // 주소
  const addressDiv = document.createElement("div");
  addressDiv.className = "overlay-address";

  const { jibun, road } = getOverlayAddressParts(data, mode);

  const renderAddress = (jibunAddr: string, roadAddr: string) => {
    let html = "";
    if (jibunAddr) {
      html += `<span class="road-addr font-medium">${escapeHtml(formatPrimaryAddress(jibunAddr, mode))}</span>`;
    }
    if (roadAddr) {
      html += `<span class="jibun-addr" style="display:block;margin-top:2px;">(도로명) ${escapeHtml(roadAddr)}</span>`;
    }
    if (!jibunAddr && !roadAddr)
      html = '<span class="road-addr">주소 없음</span>';
    addressDiv.innerHTML = html;
  };

  if (jibun || road) {
    renderAddress(jibun, road);
  } else {
    addressDiv.innerHTML = '<span class="road-addr">주소 조회 중...</span>';
    if (window.kakao?.maps?.services?.Geocoder) {
      const geocoder = new window.kakao.maps.services.Geocoder();
      const coord = new window.kakao.maps.LatLng(data.lat, data.lng);
      geocoder.coord2Address(
        coord.getLng(),
        coord.getLat(),
        (result: unknown[], status: string) => {
          const addressResult = result[0] as
            | {
                road_address?: { address_name?: string };
                address?: { address_name?: string };
              }
            | undefined;
          if (
            status === window.kakao?.maps.services.Status.OK &&
            addressResult
          ) {
            renderAddress(
              addressResult.address?.address_name || "",
              addressResult.road_address?.address_name || "",
            );
          } else {
            addressDiv.innerHTML =
              '<span class="road-addr">주소 조회 실패</span>';
          }
        },
      );
    }
  }

  container.appendChild(addressDiv);

  root.appendChild(stem);
  root.appendChild(anchor);
  root.appendChild(container);
  return root;
}

/**
 * 지도 우클릭 지점의 주소 조회 팝업(CustomOverlay content).
 * 비동기 역지오코딩 동안 status="loading" → "ok"/"fail" 로 setContent 교체한다.
 */
export function createAddressLookupContent(params: {
  lat: number;
  lng: number;
  status: "loading" | "ok" | "fail";
  roadAddress?: string;
  jibunAddress?: string;
  onClose: () => void;
}): HTMLDivElement {
  const { lat, lng, status, roadAddress, jibunAddress, onClose } = params;

  const root = document.createElement("div");
  root.className = "addr-lookup-overlay";
  // 팝업 내부 클릭이 지도로 전파돼 팝업이 닫히는 것을 막는다
  const stop = (e: Event) => e.stopPropagation();
  root.addEventListener("click", stop);
  root.addEventListener("mousedown", stop);

  const box = document.createElement("div");
  box.style.cssText =
    "min-width:180px;max-width:280px;background:#0f172a;color:#e2e8f0;" +
    "border:1px solid #334155;border-radius:8px;padding:8px 10px;font-size:11px;" +
    "line-height:1.5;box-shadow:0 6px 20px rgba(0,0,0,.45);transform:translateY(-12px);";

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;";
  const title = document.createElement("span");
  title.textContent = "📍 이 위치 주소";
  title.style.cssText = "font-weight:600;color:#f8fafc;";
  const closeBtn = document.createElement("span");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "cursor:pointer;color:#94a3b8;font-size:12px;padding:0 2px;";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClose();
  });
  header.appendChild(title);
  header.appendChild(closeBtn);
  box.appendChild(header);

  const body = document.createElement("div");
  if (status === "loading") {
    body.innerHTML = '<div style="color:#94a3b8;">주소 조회 중...</div>';
  } else if (status === "fail") {
    body.innerHTML = '<div style="color:#f87171;">주소를 찾을 수 없습니다.</div>';
  } else {
    let html = "";
    if (roadAddress) {
      html += `<div style="color:#e2e8f0;">${escapeHtml(roadAddress)}</div>`;
    }
    if (jibunAddress) {
      html += `<div style="color:#94a3b8;margin-top:2px;">(지번) ${escapeHtml(jibunAddress)}</div>`;
    }
    if (!roadAddress && !jibunAddress) {
      html = '<div style="color:#f87171;">주소 없음</div>';
    }
    body.innerHTML = html;
  }
  box.appendChild(body);

  const coords = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  const foot = document.createElement("div");
  foot.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;gap:8px;" +
    "margin-top:6px;padding-top:5px;border-top:1px solid #1e293b;";
  const coordSpan = document.createElement("span");
  coordSpan.textContent = coords;
  coordSpan.style.cssText = "color:#64748b;font-size:10px;";
  foot.appendChild(coordSpan);

  if (status !== "loading") {
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = "주소 복사";
    copyBtn.style.cssText =
      "cursor:pointer;background:#1e293b;color:#e2e8f0;border:1px solid #334155;" +
      "border-radius:4px;padding:2px 6px;font-size:10px;white-space:nowrap;";
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const text = roadAddress || jibunAddress || coords;
      navigator.clipboard
        ?.writeText(text)
        .then(() => {
          copyBtn.textContent = "복사됨!";
          window.setTimeout(() => {
            copyBtn.textContent = "주소 복사";
          }, 1500);
        })
        .catch(() => {});
    });
    foot.appendChild(copyBtn);
  }
  box.appendChild(foot);

  root.appendChild(box);
  return root;
}
