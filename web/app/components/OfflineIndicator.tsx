'use client';

import { usePWA } from './PWAProvider';

export default function OfflineIndicator() {
  const { isOnline } = usePWA();

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-yellow-500 text-yellow-900 text-center py-2 px-4 font-medium text-sm shadow-lg">
      <span className="mr-2">📴</span>
      You&apos;re offline. Some features may not work.
    </div>
  );
}
