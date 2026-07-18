"use client";

import { useCallback, useEffect, useState } from "react";
import { KAKAO_SDK_LIBRARIES } from "@/features/map-marker/constants/map-config";
import { getPublicEnv } from "@/lib/public-env";

const KAKAO_SDK_SCRIPT_ID = "kakao-map-sdk";
const KAKAO_SDK_LOAD_TIMEOUT_MS = 20000;

let kakaoLoadPromise: Promise<void> | null = null;

function waitForKakaoMapsReady(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.kakao?.maps?.load) {
      reject(new Error("카카오 지도 SDK가 초기화되지 않았습니다."));
      return;
    }

    try {
      window.kakao.maps.load(() => resolve());
    } catch (error) {
      reject(
        error instanceof Error
          ? error
          : new Error("카카오 지도 SDK 초기화에 실패했습니다."),
      );
    }
  });
}

function removeKakaoSdkScript() {
  const existing = document.getElementById(KAKAO_SDK_SCRIPT_ID);
  if (existing) {
    existing.remove();
  }
}

function createSdkScript(appKey: string) {
  const script = document.createElement("script");
  script.id = KAKAO_SDK_SCRIPT_ID;
  script.async = true;
  script.charset = "utf-8";
  script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&libraries=${KAKAO_SDK_LIBRARIES}&autoload=false`;
  return script;
}

function loadKakaoSdk(appKey: string, forceReload = false) {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("브라우저 환경에서만 카카오 SDK를 로드할 수 있습니다."),
    );
  }

  if (forceReload) {
    kakaoLoadPromise = null;
    removeKakaoSdkScript();
    // 이전 실패 상태의 전역 객체를 비워 재초기화한다.
    if (window.kakao) {
      delete (window as Window & { kakao?: unknown }).kakao;
    }
  }

  if (window.kakao?.maps?.load) {
    return waitForKakaoMapsReady();
  }

  if (!kakaoLoadPromise) {
    kakaoLoadPromise = new Promise<void>((resolve, reject) => {
      const fail = (error: Error) => {
        kakaoLoadPromise = null;
        reject(error);
      };

      const finishSuccess = () => {
        waitForKakaoMapsReady().then(resolve).catch(fail);
      };

      const existing = document.getElementById(
        KAKAO_SDK_SCRIPT_ID,
      ) as HTMLScriptElement | null;

      // 레이아웃에서 미리 넣은 script가 있으면 제거하지 않고 로드를 기다린다.
      if (existing && !forceReload) {
        if (window.kakao?.maps?.load) {
          finishSuccess();
          return;
        }

        const timeoutId = window.setTimeout(() => {
          fail(
            new Error(
              "카카오 지도 SDK 로드가 시간 초과되었습니다. 네트워크 또는 도메인 등록을 확인하세요.",
            ),
          );
        }, KAKAO_SDK_LOAD_TIMEOUT_MS);

        const onLoad = () => {
          window.clearTimeout(timeoutId);
          finishSuccess();
        };
        const onError = () => {
          window.clearTimeout(timeoutId);
          fail(
            new Error(
              "카카오 지도 SDK 로드에 실패했습니다. JavaScript 키·사이트 도메인·네트워크를 확인하세요.",
            ),
          );
        };

        existing.addEventListener("load", onLoad, { once: true });
        existing.addEventListener("error", onError, { once: true });

        // load 이벤트가 이미 지난 경우를 대비해 폴링한다.
        const startedAt = Date.now();
        const pollId = window.setInterval(() => {
          if (window.kakao?.maps?.load) {
            window.clearInterval(pollId);
            window.clearTimeout(timeoutId);
            existing.removeEventListener("load", onLoad);
            existing.removeEventListener("error", onError);
            finishSuccess();
            return;
          }
          if (Date.now() - startedAt > KAKAO_SDK_LOAD_TIMEOUT_MS) {
            window.clearInterval(pollId);
          }
        }, 50);

        return;
      }

      const script = createSdkScript(appKey);
      const timeoutId = window.setTimeout(() => {
        script.onload = null;
        script.onerror = null;
        removeKakaoSdkScript();
        fail(
          new Error(
            "카카오 지도 SDK 로드가 시간 초과되었습니다. 네트워크 또는 도메인 등록을 확인하세요.",
          ),
        );
      }, KAKAO_SDK_LOAD_TIMEOUT_MS);

      script.onload = () => {
        window.clearTimeout(timeoutId);
        finishSuccess();
      };
      script.onerror = () => {
        window.clearTimeout(timeoutId);
        removeKakaoSdkScript();
        fail(
          new Error(
            "카카오 지도 SDK 로드에 실패했습니다. JavaScript 키·사이트 도메인·네트워크를 확인하세요.",
          ),
        );
      };

      document.head.appendChild(script);
    });
  }

  return kakaoLoadPromise;
}

export function useKakaoMapSdk() {
  const rawAppKey = getPublicEnv("NEXT_PUBLIC_KAKAO_MAP_APP_KEY");
  const appKey = rawAppKey.trim();
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setIsReady(false);
    setRetryToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (!appKey) {
      setError("NEXT_PUBLIC_KAKAO_MAP_APP_KEY가 설정되지 않았습니다.");
      setIsReady(false);
      return;
    }

    let cancelled = false;
    const forceReload = retryToken > 0;

    loadKakaoSdk(appKey, forceReload)
      .then(() => {
        if (cancelled) return;
        setIsReady(true);
        setError(null);
      })
      .catch((loadError: Error) => {
        if (cancelled) return;
        setIsReady(false);
        setError(loadError.message);
      });

    return () => {
      cancelled = true;
    };
  }, [appKey, retryToken]);

  return { isReady, error, appKey, retry };
}
