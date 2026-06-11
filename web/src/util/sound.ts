/**
 * Tiny WebAudio sound effects (Phase 4). Synthesizes short beeps on demand —
 * no audio assets to ship — for UI/game feedback. Gated by the settings store
 * via {@link setSoundEnabled} / {@link setSoundVolume}; call {@link playSound}
 * to play a named cue.
 *
 * Everything degrades gracefully when WebAudio is unavailable (jsdom / older
 * browsers): the module imports and the setters/playSound become no-ops.
 */

/** Named sound cues and their synthesized characteristics. */
export type SoundName =
  | 'click' // generic button / control activation
  | 'roll' // dice roll
  | 'build' // piece placed
  | 'turn' // it's your turn
  | 'trade' // trade offer / accept
  | 'error'; // invalid action / rejection

interface Tone {
  /** Oscillator frequency in Hz. */
  freq: number;
  /** Duration in seconds. */
  duration: number;
  /** Oscillator waveform. */
  type: OscillatorType;
}

/** Per-cue tone recipe. Kept deliberately short and distinct. */
const TONES: Record<SoundName, Tone> = {
  click: { freq: 660, duration: 0.05, type: 'square' },
  roll: { freq: 440, duration: 0.12, type: 'triangle' },
  build: { freq: 540, duration: 0.1, type: 'sine' },
  turn: { freq: 784, duration: 0.18, type: 'sine' },
  trade: { freq: 600, duration: 0.1, type: 'triangle' },
  error: { freq: 180, duration: 0.22, type: 'sawtooth' },
};

let enabled = true;
let volume = 0.5;

/** Lazily-created shared AudioContext; null until first sound / unsupported. */
let audioCtx: AudioContext | null = null;

/** Enable or disable all sound playback. Set from the settings store. */
export function setSoundEnabled(value: boolean): void {
  enabled = value;
}

/** Set the master volume (clamped 0..1). Set from the settings store. */
export function setSoundVolume(value: number): void {
  volume = Math.min(1, Math.max(0, value));
}

/** Current enabled flag — exposed mainly for tests. */
export function isSoundEnabled(): boolean {
  return enabled;
}

/**
 * Resolve the AudioContext constructor across vendor prefixes, or null when
 * WebAudio isn't available (tests / unsupported browsers).
 */
function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') {
    return null; // <--- Early return: no window (SSR / test import) ---
  }
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Lazily obtain (and resume) the shared AudioContext, or null if unsupported. */
function ensureContext(): AudioContext | null {
  if (audioCtx) {
    return audioCtx;
  }
  const Ctor = getAudioContextCtor();
  if (!Ctor) {
    return null; // <--- Early return: WebAudio unsupported ---
  }
  try {
    audioCtx = new Ctor();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

/**
 * Play a named sound cue, if sound is enabled and WebAudio is available.
 * Silently no-ops otherwise; never throws.
 */
export function playSound(name: SoundName): void {
  if (!enabled || volume <= 0) {
    return; // <--- Early return: muted ---
  }
  const tone = TONES[name];
  if (!tone) {
    return; // <--- Early return: unknown cue ---
  }
  const ctx = ensureContext();
  if (!ctx) {
    return; // <--- Early return: no audio support ---
  }
  // Browsers start the context suspended until a user gesture; nudge it.
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type;
    osc.frequency.value = tone.freq;
    // Short attack + exponential release so beeps don't click.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + tone.duration + 0.02);
  } catch {
    // Ignore playback errors — audio is best-effort feedback.
  }
}
