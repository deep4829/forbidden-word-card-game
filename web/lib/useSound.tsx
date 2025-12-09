import { useEffect, useState, useCallback } from 'react';
import playSound, { default as _playSound } from './sounds';

const STORAGE_KEY = 'fwg-muted';

export function useSound() {
  const [mounted, setMounted] = useState(false);
  const [muted, setMuted] = useState<boolean>(false);

  // Initialize from localStorage only on client
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      setMuted(v === '1');
      setMounted(true);
    } catch (e) {
      setMounted(true);
    }
  }, []);

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
