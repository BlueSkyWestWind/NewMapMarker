'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usePlaceSearch } from '@/features/map-marker/hooks/use-place-search';

export function PlaceSearchSection() {
  const {
    query,
    setQuery,
    isSearching,
    status,
    isError,
    hasResult,
    runSearch,
    clearSearch,
  } = usePlaceSearch();

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
              void runSearch();
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
          disabled={isSearching || !query.trim()}
          onClick={() => void runSearch()}
        >
          {isSearching ? '검색 중...' : '검색'}
        </Button>
        {hasResult ? (
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
