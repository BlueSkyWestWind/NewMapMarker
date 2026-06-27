'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function PlaceSearchSection() {
  return (
    <div className="space-y-2 pb-1">
      <div className="relative">
        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
        <Input
          disabled
          placeholder="장소, 주소 검색..."
          className="h-8 border-slate-700 bg-slate-900/60 pl-8 text-xs"
        />
      </div>
      <Button
        type="button"
        disabled
        size="sm"
        className="h-8 w-full text-xs"
        variant="secondary"
      >
        검색
      </Button>
      <p className="text-[10px] text-slate-500">장소 검색 기능은 준비 중입니다.</p>
    </div>
  );
}
