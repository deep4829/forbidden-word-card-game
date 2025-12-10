import { useEffect, useState, useCallback, useRef } from 'react';
import playSound, { default as _playSound } from './sounds';

const STORAGE_KEY = 'fwg-muted';

export function useSound() {
  const [mounted, setMounted] = useState(false);
  const [muted, setMuted] = useState<boolean>(false);
  const mutedRef = useRef(false);

  // Initialize from localStorage only on client
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      const isMuted = v === '1';
      setMuted(isMuted);
      mutedRef.current = isMuted;
      setMounted(true);
    } catch (e) {
      setMounted(true);
    }
  }, []);

  useEffect(() => {
    mutedRef.current = muted;
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
      }
    } catch (e) {
      // ignore
    }
  }, [muted]);

  const toggle = useCallback(() => {
    setMuted((m) => {
      const newValue = !m;
      mutedRef.current = newValue;
      return newValue;
    });
  }, []);

  const play = useCallback((name: Parameters<typeof playSound>[0]) => {
    // Use ref to get the most current muted state
    if (!mutedRef.current) {
      try {
        playSound(name);
      } catch (e) {
        console.error('Sound playback error:', e);
      }
    }
  }, []);

  return { muted, toggle, setMuted, play } as const;
}
