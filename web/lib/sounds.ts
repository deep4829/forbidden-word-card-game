type SoundName = 'success' | 'error' | 'info' | 'click' | 'forbidden' | 'start';

let audioCtx: AudioContext | null = null;

function ensureAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      audioCtx = null;
    }
  }
  return audioCtx;
}

function playTone(frequency: number, duration = 0.12, type: OscillatorType = 'sine') {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

export function playSound(name: SoundName) {
  try {
    switch (name) {
      case 'success':
        playTone(880, 0.12, 'triangle');
        playTone(1320, 0.09, 'sine');
        break;
      case 'error':
        playTone(220, 0.18, 'sawtooth');
        playTone(170, 0.12, 'sine');
        break;
      case 'forbidden':
        playTone(300, 0.22, 'sawtooth');
        break;
      case 'info':
        playTone(520, 0.12, 'sine');
        break;
      case 'click':
        playTone(900, 0.06, 'square');
        break;
      case 'start':
        playTone(600, 0.08, 'sine');
        playTone(760, 0.08, 'triangle');
        break;
      default:
        playTone(440, 0.08, 'sine');
    }
  } catch (e) {
    // Silence failures in environments without WebAudio
  }
}

export default playSound;
