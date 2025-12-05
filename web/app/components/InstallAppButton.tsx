'use client';

import { usePWA } from './PWAProvider';

export default function InstallAppButton() {
  const { isInstallable, isInstalled, installApp } = usePWA();

  // Don't show if already installed or not installable
  if (isInstalled || !isInstallable) {
    return null;
  }

  return (
    <button
      onClick={installApp}
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 animate-pulse"
      aria-label="Install App"
    >
      <span className="text-xl">📲</span>
      <span className="text-sm">Install App</span>
    </button>
  );
}
