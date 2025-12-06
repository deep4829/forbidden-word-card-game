'use client';

import { usePathname } from 'next/navigation';
import { usePWA } from './PWAProvider';

export default function InstallAppButton() {
  const { isInstallable, isInstalled, installApp } = usePWA();
  const pathname = usePathname();

  // Don't show if already installed or not installable
  if (isInstalled || !isInstallable) {
    return null;
  }

  // Only show on join page (/join) and lobby page (/room/[id])
  // Hide on game page (/room/[id]/game) and results page (/room/[id]/results)
  const isJoinPage = pathname === '/join';
  const isLobbyPage = pathname.match(/^\/room\/[^/]+$/) && !pathname.includes('/game') && !pathname.includes('/results');
  
  if (!isJoinPage && !isLobbyPage) {
    return null;
  }

  // For join page, render as inline button positioned with logo
  if (isJoinPage) {
    return (
      <button
        onClick={installApp}
        className="w-full py-2 sm:py-3 px-4 sm:px-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 animate-pulse text-sm sm:text-base flex items-center justify-center gap-2"
        aria-label="Install App"
      >
        <span className="text-lg">📲</span>
        <span>Install App</span>
      </button>
    );
  }

  // For lobby page, render as floating button at top right
  return (
    <button
      onClick={installApp}
      className="fixed top-20 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 animate-pulse"
      aria-label="Install App"
    >
      <span className="text-xl">📲</span>
      <span className="text-sm">Install App</span>
    </button>
  );
}
