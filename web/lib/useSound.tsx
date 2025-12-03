import { useEffect, useState, useCallback } from 'react';
import playSound, { default as _playSound } from './sounds';

const STORAGE_KEY = 'fwg-muted';

export function useSound() {
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      const v = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      return v === '1';
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
      }
    } catch (e) {
      // ignore
    }
  }, [muted]);

  const toggle = useCallback(() => setMuted((m) => !m), []);

  const play = useCallback((name: Parameters<typeof playSound>[0]) => {
    if (!muted) {
      try {
        playSound(name);
      } catch (e) {
        // ignore
      }
    }
  }, [muted]);

  return { muted, toggle, setMuted, play } as const;
}
