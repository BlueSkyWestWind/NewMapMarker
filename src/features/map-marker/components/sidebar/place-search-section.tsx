'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import { fetchParcelBoundary } from '@/features/map-marker/lib/parcel-boundary';

export function PlaceSearchSection() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const placeSearch = useMapMarkerStore((state) => state.placeSearch);
  const setPlaceSearch = useMapMarkerStore((state) => state.setPlaceSearch);

  const runSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed || isSearching) return;

    setIsSearching(true);
    setIsError(false);
    setStatus('경계 조회 중...');

    try {
      const result = await fetchParcelBoundary(trimmed);
      setPlaceSearch(result);
      if (result.parcels.length === 0) {
        setStatus('필지 경계를 찾지 못해 위치로 이동했습니다.');
      } else {
        setStatus(`경계 ${result.parcels.length}건 표시${result.label ? ` · ${result.label}` : ''}`);
      }
    } catch (err) {
      setIsError(true);
      setStatus(err instanceof Error ? err.message : '검색에 실패했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setPlaceSearch(null);
    setStatus(null);
    setIsError(false);
    setQuery('');
  };

  return (
    <div className="space-y-2 pb-1">
      <div className="relative">
        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              runSearch();
            }
          }}
          placeholder="장소, 주소 검색..."
          className="h-8 border-slate-700 bg-slate-900/60 pl-8 text-xs"
        />
      </div>
      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-8 flex-1 text-xs"
          variant="secondary"
          disabled={isSearching || !query.trim()}
          onClick={runSearch}
        >
          {isSearching ? '검색 중...' : '검색'}
        </Button>
        {placeSearch ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs text-slate-400"
            onClick={clearSearch}
            title="경계 지우기"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
      {status ? (
        <p
          className={`text-[10px] ${isError ? 'text-rose-400' : 'text-slate-400'}`}
        >
          {status}
        </p>
      ) : (
        <p className="text-[10px] text-slate-500">
          주소를 검색하면 지도에 필지 경계가 표시됩니다.
        </p>
      )}
    </div>
  );
}
