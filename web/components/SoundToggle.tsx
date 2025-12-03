"use client";

import React from 'react';
import { useSound } from '@/lib/useSound';

export default function SoundToggle() {
  const { muted, toggle } = useSound();
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        toggle();
      }}
      aria-pressed={muted}
      title={muted ? 'Unmute sounds' : 'Mute sounds'}
      className="px-4 py-2 rounded-full bg-white shadow-lg hover:shadow-xl text-sm sm:text-base font-bold transition-all transform hover:scale-110 active:scale-95 flex items-center gap-2 border-2 border-gray-200 hover:border-gray-300"
    >
      {muted ? '🔇' : '🔊'} <span className="hidden sm:inline text-xs">{muted ? 'Muted' : 'Sound On'}</span>
    </button>
  );
}

