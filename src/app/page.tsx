'use client';

import { AuthGate } from '@/features/map-marker/components/auth-gate';
import { MapMarkerPage } from '@/features/map-marker/components/map-marker-page';

export default function Home() {
  return (
    <AuthGate>
      <MapMarkerPage />
    </AuthGate>
  );
}
