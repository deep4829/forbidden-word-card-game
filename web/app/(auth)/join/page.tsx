'use client';

import { Suspense } from 'react';
import JoinContent from '../join-content';

function JoinLoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mb-4"></div>
        <p className="text-white text-xl font-semibold">Loading...</p>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<JoinLoadingFallback />}>
      <JoinContent />
    </Suspense>
  );
}
