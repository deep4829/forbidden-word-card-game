import { useEffect, useState, useCallback } from 'react';
import playSound from './sounds';

const STORAGE_KEY = 'fwg-muted';

// Singleton muted state - accessed across all component instances
class SoundManager {
  private muted: boolean = false;

  constructor() {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        this.muted = stored === '1';
      } catch (e) {
        this.muted = false;
      }
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(value: boolean): void {
    this.muted = value;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
      } catch (e) {
        // ignore
      }
    }
  }

  playSound(name: string): void {
    if (!this.muted) {
      try {
        playSound(name as any);
      } catch (e) {
        console.error('Sound playback error:', e);
      }
    }
  }
}

// Single global instance
const soundManager = new SoundManager();

export function useSound() {
  const [muted, setMutedState] = useState<boolean>(false);

  // Initialize from manager on mount
  useEffect(() => {
    setMutedState(soundManager.isMuted());
  }, []);

  const setMuted = useCallback((value: boolean) => {
    soundManager.setMuted(value);
    setMutedState(value);
  }, []);

  const toggle = useCallback(() => {
    const newValue = !soundManager.isMuted();
    setMuted(newValue);
  }, [setMuted]);

  const play = useCallback((name: Parameters<typeof playSound>[0]) => {
    soundManager.playSound(name);
  }, []);

  return { muted, toggle, setMuted, play } as const;
}
