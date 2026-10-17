import { AuthGate } from '@/features/map-marker/components/auth-gate';
import { GpsMapPage } from '@/features/gpsmap/components/gpsmap-page';

export default function GpsMapRoutePage() {
  return (
    <AuthGate>
      <GpsMapPage />
    </AuthGate>
  );
}
