"use client";

import { ErrorReport } from "@/components/error-report";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorReport {...props} />;
}
