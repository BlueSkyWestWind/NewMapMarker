'use client';

import 'leaflet/dist/leaflet.css';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type * as LType from 'leaflet';
import { getPublicEnv } from '@/lib/public-env';
import type { LatLng } from '../lib/vworld-gpsmap';

/**
 * 하단 브이월드 지적도 페인 (Leaflet).
 * - 베이스: VWorld XDWorld 2D 타일(키 불필요)
 * - 지적도: VWorld WMS(lp_pa_cbnd_bubun/bonbun) 오버레이 — 브라우저 직접 로드
 *   (VWorld는 Cloudflare 등 서버 프록시를 거부하므로 클라이언트에서 직접 호출)
 * Leaflet은 window에 의존하므로 SSR/정적 프리렌더를 피해 useEffect에서 동적 import.
 */

const VWORLD_BASE_TILE = 'https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png';
const VWORLD_WMS = 'https://api.vworld.kr/req/wms?';
const CADASTRAL_LAYERS = 'lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun';

export interface VworldMapHandle {
  /** 프로그램적 이동(동기화). 사용자 이동으로 오인되지 않도록 내부 lock 처리. */
  setView: (lat: number, lng: number, leafletZoom: number) => void;
  /** 선택 필지(빨간 경계) 갱신. */
  setParcels: (rings: LatLng[][]) => void;
}

interface Props {
  /** 사용자가 이 지도를 직접 움직였을 때(상단 카카오맵과 동기화용). */
  onUserMove?: (lat: number, lng: number, leafletZoom: number) => void;
}

export const VworldMapPane = forwardRef<VworldMapHandle, Props>(
  function VworldMapPane({ onUserMove }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<LType.Map | null>(null);
    const leafletRef = useRef<typeof LType | null>(null);
    const cadastralRef = useRef<LType.TileLayer.WMS | null>(null);
    const parcelLayerRef = useRef<LType.LayerGroup | null>(null);
    const lockRef = useRef(false);
    const onUserMoveRef = useRef(onUserMove);
    onUserMoveRef.current = onUserMove;

    const [ready, setReady] = useState(false);
    const [cadastralOn, setCadastralOn] = useState(true);

    const createCadastral = (): LType.TileLayer.WMS | null => {
      const L = leafletRef.current;
      const map = mapRef.current;
      if (!L || !map) return null;
      const key = getPublicEnv('NEXT_PUBLIC_VWORLD_API_KEY');
      if (!key) return null;
      const options = {
        layers: CADASTRAL_LAYERS,
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        maxZoom: 20,
        key,
        domain: window.location.origin,
      } as unknown as LType.WMSOptions;
      return L.tileLayer.wms(VWORLD_WMS, options);
    };

    useEffect(() => {
      let cancelled = false;
      void (async () => {
        const L = (await import('leaflet')).default as typeof LType;
        if (cancelled || !containerRef.current || mapRef.current) return;
        leafletRef.current = L;

        const map = L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: false,
        }).setView([36.5, 127.8], 7);
        L.tileLayer(VWORLD_BASE_TILE, { maxZoom: 20 }).addTo(map);
        mapRef.current = map;
        parcelLayerRef.current = L.layerGroup().addTo(map);

        const cadastral = createCadastral();
        if (cadastral) {
          cadastral.addTo(map);
          cadastralRef.current = cadastral;
        }

        map.on('moveend', () => {
          if (lockRef.current) return;
          const c = map.getCenter();
          onUserMoveRef.current?.(c.lat, c.lng, map.getZoom());
        });

        // flex 레이아웃에서 컨테이너 크기 확정 후 타일 재계산
        requestAnimationFrame(() => map.invalidateSize());
        setReady(true);
      })();

      return () => {
        cancelled = true;
        mapRef.current?.remove();
        mapRef.current = null;
      };
    }, []);

    const toggleCadastral = () => {
      const map = mapRef.current;
      if (!map) return;
      const layer = cadastralRef.current;
      if (layer && map.hasLayer(layer)) {
        map.removeLayer(layer);
        setCadastralOn(false);
        return;
      }
      if (layer) {
        layer.addTo(map);
        setCadastralOn(true);
        return;
      }
      const created = createCadastral();
      if (created) {
        created.addTo(map);
        cadastralRef.current = created;
        setCadastralOn(true);
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        setView(lat, lng, leafletZoom) {
          const map = mapRef.current;
          if (!map) return;
          lockRef.current = true;
          map.setView([lat, lng], leafletZoom, { animate: false });
          setTimeout(() => {
            lockRef.current = false;
          }, 0);
        },
        setParcels(rings) {
          const L = leafletRef.current;
          const group = parcelLayerRef.current;
          if (!L || !group) return;
          group.clearLayers();
          rings.forEach((ring) => {
            if (ring.length < 3) return;
            L.polygon(
              ring.map((p) => [p.lat, p.lng] as [number, number]),
              {
                color: '#ff2d78',
                weight: 3,
                opacity: 0.9,
                fillColor: '#ff2d78',
                fillOpacity: 0.12,
              },
            ).addTo(group);
          });
        },
      }),
      [],
    );

    return (
      <div className="relative h-full w-full">
        <div ref={containerRef} className="h-full w-full" />
        <div className="pointer-events-none absolute left-3 top-3 z-[600] rounded-md bg-slate-950/80 px-2.5 py-1 text-[11px] text-slate-300 shadow">
          🟩 브이월드 지적도
        </div>
        <button
          type="button"
          onClick={toggleCadastral}
          className="absolute right-3 top-3 z-[600] rounded-md border border-slate-700 bg-slate-900/90 px-2 py-1 text-[11px] font-medium text-slate-200 shadow hover:bg-slate-800"
        >
          {cadastralOn ? '지적도 끄기' : '지적도 켜기'}
        </button>
        {!ready ? (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-slate-950/60 text-xs text-slate-400">
            지적도 로딩 중...
          </div>
        ) : null}
      </div>
    );
  },
);
