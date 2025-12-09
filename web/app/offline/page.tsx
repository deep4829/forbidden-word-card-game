'use client';

export default function OfflinePage() {
  return (
    <div className="h-screen h-dvh flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
      <div className="text-center">
        <div className="text-6xl mb-4">📡</div>
        <h1 className="text-white text-3xl font-bold mb-2">You're Offline</h1>
        <p className="text-white text-lg">Please check your internet connection and try again.</p>
      </div>
    </div>
  );
}
