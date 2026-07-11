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
  }

  interface KakaoMap {
    setCenter: (latlng: KakaoLatLng) => void;
    setLevel: (level: number) => void;
    getLevel: () => number;
    panTo: (latlng: KakaoLatLng) => void;
    setBounds: (bounds: KakaoLatLngBounds) => void;
    setDraggable: (flag: boolean) => void;
    addOverlayMapTypeId: (typeId: unknown) => void;
    removeOverlayMapTypeId: (typeId: unknown) => void;
  }

  interface KakaoMarker {
    setMap: (map: KakaoMap | null) => void;
    getPosition: () => KakaoLatLng;
    setPosition: (latlng: KakaoLatLng) => void;
    setDraggable: (flag: boolean) => void;
    _clickHandler?: () => void;
  }

  interface KakaoMarkerImage {
    /* marker image */
  }

  interface KakaoSize {
    /* size */
  }

  interface KakaoPoint {
    /* point */
  }

  interface KakaoCustomOverlay {
    setMap: (map: KakaoMap | null) => void;
    getContent: () => HTMLElement;
    setContent: (content: HTMLElement | string) => void;
  }

  interface KakaoCluster {
    getMarkers: () => KakaoMarker[];
    getClusterMarker: () => KakaoCustomOverlay;
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
