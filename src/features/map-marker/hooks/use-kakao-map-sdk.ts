'use client';

import { useEffect, useState } from 'react';
import { KAKAO_SDK_LIBRARIES } from '@/features/map-marker/constants/map-config';

let kakaoLoadPromise: Promise<void> | null = null;

function loadKakaoSdk(appKey: string) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('브라우저 환경에서만 카카오 SDK를 로드할 수 있습니다.'));
  }

  if (window.kakao?.maps) {
    return new Promise<void>((resolve) => {
      window.kakao?.maps.load(() => resolve());
    });
  }

  if (!kakaoLoadPromise) {
    kakaoLoadPromise = new Promise<void>((resolve, reject) => {
      const existing = document.getElementById('kakao-map-sdk');
      if (existing) {
        existing.addEventListener('load', () => {
          window.kakao?.maps.load(() => resolve());
        });
        return;
      }

      const script = document.createElement('script');
      script.id = 'kakao-map-sdk';
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=${KAKAO_SDK_LIBRARIES}&autoload=false`;
      script.async = true;
      script.onload = () => {
        window.kakao?.maps.load(() => resolve());
      };
      script.onerror = () => {
        kakaoLoadPromise = null;
        reject(new Error('카카오 지도 SDK 로드에 실패했습니다.'));
      };
      document.head.appendChild(script);
    });
  }

  return kakaoLoadPromise;
}

export function useKakaoMapSdk() {
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? '';
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appKey) {
      setError('NEXT_PUBLIC_KAKAO_MAP_APP_KEY가 설정되지 않았습니다.');
      return;
    }

    loadKakaoSdk(appKey)
      .then(() => {
        setIsReady(true);
        setError(null);
      })
      .catch((loadError: Error) => {
        setError(loadError.message);
      });
  }, [appKey]);

  return { isReady, error, appKey };
}
