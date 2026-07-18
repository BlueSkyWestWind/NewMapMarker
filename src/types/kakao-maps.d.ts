export {};

declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (callback: () => void) => void;
        LatLng: new (lat: number, lng: number) => KakaoLatLng;
        LatLngBounds: new () => KakaoLatLngBounds;
        Map: new (
          container: HTMLElement,
          options: { center: KakaoLatLng; level: number; mapTypeId: unknown },
        ) => KakaoMap;
        Marker: new (options: {
          position: KakaoLatLng;
          title?: string;
          image?: KakaoMarkerImage;
          draggable?: boolean;
          zIndex?: number;
        }) => KakaoMarker;
        MarkerImage: new (
          src: string,
          size: KakaoSize,
          options?: { offset?: KakaoPoint },
        ) => KakaoMarkerImage;
        Size: new (width: number, height: number) => KakaoSize;
        Point: new (x: number, y: number) => KakaoPoint;
        CustomOverlay: new (options: {
          content: HTMLElement | string;
          position: KakaoLatLng;
          xAnchor?: number;
          yAnchor?: number;
          zIndex?: number;
        }) => KakaoCustomOverlay;
        MarkerClusterer: new (options: {
          map: KakaoMap;
          averageCenter?: boolean;
          minLevel?: number;
          disableClickZoom?: boolean;
          styles?: Array<Record<string, string | number>>;
          texts?: string[] | ((size: number) => string);
        }) => KakaoMarkerClusterer;
        MapTypeId: {
          HYBRID: unknown;
          USE_DISTRICT: unknown;
        };
        event: {
          addListener: (
            target: unknown,
            type: string,
            handler: (...args: unknown[]) => void,
          ) => void;
          removeListener: (
            target: unknown,
            type: string,
            handler: (...args: unknown[]) => void,
          ) => void;
          trigger: (target: unknown, type: string, ...args: unknown[]) => void;
        };
        services: {
          Geocoder: new () => KakaoGeocoder;
          Places: new () => KakaoPlaces;
          Status: { OK: string };
        };
      };
    };
  }

  interface KakaoLatLng {
    getLat: () => number;
    getLng: () => number;
  }

  interface KakaoLatLngBounds {
    extend: (latlng: KakaoLatLng) => void;
    getSouthWest: () => KakaoLatLng;
    getNorthEast: () => KakaoLatLng;
  }

  interface KakaoMap {
    setCenter: (latlng: KakaoLatLng) => void;
    getCenter: () => KakaoLatLng;
    setLevel: (
      level: number,
      options?: {
        anchor?: KakaoLatLng;
        animate?: boolean | { duration: number };
      },
    ) => void;
    getLevel: () => number;
    panTo: (latlng: KakaoLatLng) => void;
    setBounds: (bounds: KakaoLatLngBounds) => void;
    getBounds: () => KakaoLatLngBounds;
    setDraggable: (flag: boolean) => void;
    setZoomable: (zoomable: boolean) => void;
    getProjection: () => KakaoMapProjection;
    addOverlayMapTypeId: (typeId: unknown) => void;
    removeOverlayMapTypeId: (typeId: unknown) => void;
  }

  interface KakaoMapProjection {
    containerPointFromCoords: (latlng: KakaoLatLng) => KakaoPoint;
    coordsFromContainerPoint: (point: KakaoPoint) => KakaoLatLng;
    /** 고정 줌에서 1단위 ≈ 화면 1px인 월드 좌표 */
    pointFromCoords?: (latlng: KakaoLatLng) => KakaoPoint;
    coordsFromPoint?: (point: KakaoPoint) => KakaoLatLng;
  }

  interface KakaoMarker {
    setMap: (map: KakaoMap | null) => void;
    getPosition: () => KakaoLatLng;
    setPosition: (latlng: KakaoLatLng) => void;
    setDraggable: (flag: boolean) => void;
    markerId?: string;
    markerColor?: string;
    _clickHandler?: () => void;
  }

  interface KakaoMarkerImage {
    /* marker image */
  }

  interface KakaoSize {
    /* size */
  }

  interface KakaoPoint {
    getX: () => number;
    getY: () => number;
    x: number;
    y: number;
  }

  interface KakaoCustomOverlay {
    setMap: (map: KakaoMap | null) => void;
    getMap: () => KakaoMap | null;
    getContent: () => HTMLElement | string;
    setContent: (content: HTMLElement | string) => void;
    getPosition: () => KakaoLatLng;
    setPosition: (latlng: KakaoLatLng) => void;
    setZIndex?: (zIndex: number) => void;
  }

  interface KakaoCluster {
    getMarkers: () => KakaoMarker[];
    getClusterMarker: () => KakaoCustomOverlay;
    getCenter: () => KakaoLatLng;
    getBounds: () => KakaoLatLngBounds;
    getSize: () => number;
  }

  interface KakaoMarkerClusterer {
    addMarkers: (markers: KakaoMarker[]) => void;
    clear: () => void;
    redraw: () => void;
    removeMarker: (marker: KakaoMarker) => void;
  }

  interface KakaoGeocoder {
    coord2Address: (
      lng: number,
      lat: number,
      callback: (result: unknown[], status: string) => void,
    ) => void;
    addressSearch: (
      address: string,
      callback: (result: unknown[], status: string) => void,
    ) => void;
  }

  interface KakaoPlaces {
    keywordSearch: (
      keyword: string,
      callback: (result: unknown[], status: string) => void,
    ) => void;
  }
}
