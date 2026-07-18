import type {
  BatteryMarker,
  EquipmentMarker,
  MapMode,
  MarkerRecord,
} from "@/features/map-marker/types/marker";

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

/** innerHTML 삽입 전 문자열을 이스케이프해 XSS를 방지한다. */
function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

  // mouseup/pointerup 은 막지 않는다 — 정보창 드래그 종료 이벤트가 끊기면
  // 지도가 드래그 불가 상태로 남는 문제가 발생한다
  const stopPropagation = (e: Event) => e.stopPropagation();
  root.addEventListener("click", stopPropagation);
  root.addEventListener("mousedown", stopPropagation);
  root.addEventListener("touchstart", stopPropagation);

  const header = document.createElement("div");
  header.className = "overlay-header";

  const title = document.createElement("div");
  title.className = "overlay-title";
  title.textContent = data.name;

  const closeBtn = document.createElement("span");
  closeBtn.className = "overlay-close";
  closeBtn.innerHTML = "&#x2715;";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClose();
  });

  header.appendChild(title);
  header.appendChild(closeBtn);
  container.appendChild(header);

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
      html += `<span class="road-addr font-medium">${escapeHtml(formatJibunAddress(jibun))}</span>`;
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
              html += `<span class="road-addr font-medium">${escapeHtml(formatJibunAddress(jibunAddr))}</span>`;
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

  container.appendChild(addressDiv);

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

  container.appendChild(actions);

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

  // 국소명 (드래그 핸들 역할)
  const header = document.createElement("div");
  header.className = "overlay-header";

  const title = document.createElement("div");
  title.className = "overlay-title";
  title.textContent = data.name;
  header.appendChild(title);
  container.appendChild(header);

  // 주소
  const addressDiv = document.createElement("div");
  addressDiv.className = "overlay-address";

  const jibun =
    mode === "equipment" ? (data as EquipmentMarker).jibunAddress : "";
  const road =
    mode === "equipment"
      ? (data as EquipmentMarker).roadAddress
      : (data as BatteryMarker).address;

  const renderAddress = (jibunAddr: string, roadAddr: string) => {
    let html = "";
    if (jibunAddr) {
      html += `<span class="road-addr font-medium">${escapeHtml(formatJibunAddress(jibunAddr))}</span>`;
    }
    if (roadAddr) {
      html += `<span class="jibun-addr" style="display:block;margin-top:2px;">(도로명) ${escapeHtml(roadAddr)}</span>`;
    }
    if (!jibunAddr && !roadAddr) html = '<span class="road-addr">주소 없음</span>';
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
