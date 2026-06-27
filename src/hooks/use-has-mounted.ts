'use client';

import { useEffect, useState } from 'react';

/** SSR과 클라이언트 초기 렌더를 맞추기 위해 마운트 완료 여부를 반환한다. */
export function useHasMounted() {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  return hasMounted;
}
