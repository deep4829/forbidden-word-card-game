'use client';

import { useEffect, useState } from 'react';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // If back online, redirect to home
  useEffect(() => {
    if (isOnline) {
      window.location.href = '/';
    }
  }, [isOnline]);

  return (
    <div className="min-h-screen overflow-y-auto bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        <div className="text-6xl mb-4">📴</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re Offline</h1>
        <p className="text-gray-600 mb-6">
          It looks like you&apos;ve lost your internet connection. The Forbidden Word Game requires an active connection to play with friends.
        </p>
        <div className="space-y-4">
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg"
          >
            🔄 Try Again
          </button>
          <p className="text-sm text-gray-500">
            We&apos;ll automatically reconnect when your internet is back.
          </p>
        </div>
        
        {/* Tips while offline */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="font-semibold text-gray-800 mb-3">💡 Game Tips</h3>
          <ul className="text-left text-sm text-gray-600 space-y-2">
            <li>• Give creative clues without using forbidden words</li>
            <li>• The fewer clues you use, the more points you earn</li>
            <li>• Listen carefully to other players&apos; guesses</li>
            <li>• Have fun with friends!</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
