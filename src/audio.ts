let audioCtx: AudioContext | null = null;
let muted = localStorage.getItem('cascade-muted') === '1';

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export function isMuted(): boolean { return muted; }

export function toggleMute(): boolean {
  muted = !muted;
  localStorage.setItem('cascade-muted', muted ? '1' : '0');
  return muted;
}

/** Resume audio context (must be called from user gesture) */
export function resumeAudio(): void {
  const ctx = getCtx();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
}

/** Short synthesized tile-click sound */
export function playTileClick(): void {
  if (muted) return;
  const ctx = getCtx();
  if (ctx.state !== 'running') return;

  const now = ctx.currentTime;

  // Short noise burst filtered to sound like a wooden tile click
  const bufferSize = ctx.sampleRate * 0.03; // 30ms
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 3000;
  filter.Q.value = 2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(now + 0.04);
}

// ── Arpeggio notes (C major scale, octave 5-6) ──────────────

// Frequencies for a bright major arpeggio
const ARPEGGIO_NOTES = [
  523.25,  // C5
  659.25,  // E5
  783.99,  // G5
  1046.50, // C6
  1318.51, // E6
  1567.98, // G6
  2093.00, // C7
];

/**
 * Play an ascending arpeggio scaled to word length.
 * Longer words = more notes = more satisfying.
 */
export function playWordArpeggio(wordLength: number): void {
  if (muted) return;
  const ctx = getCtx();
  if (ctx.state !== 'running') return;

  const now = ctx.currentTime;
  const noteCount = Math.min(Math.max(wordLength, 2), ARPEGGIO_NOTES.length);
  const noteSpacing = 0.07; // 70ms between notes
  const noteDuration = 0.25;

  for (let i = 0; i < noteCount; i++) {
    const t = now + i * noteSpacing;
    const freq = ARPEGGIO_NOTES[i];

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    // Add a subtle shimmer with a second oscillator slightly detuned
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 1.002, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + noteDuration);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + noteDuration);
    osc2.start(t);
    osc2.stop(t + noteDuration);
  }
}

/** Board clear whoosh - low filtered noise sweep */
export function playBoardClear(): void {
  if (muted) return;
  const ctx = getCtx();
  if (ctx.state !== 'running') return;

  const now = ctx.currentTime;
  const duration = 0.5;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(200, now);
  filter.frequency.exponentialRampToValueAtTime(2000, now + 0.15);
  filter.frequency.exponentialRampToValueAtTime(100, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(now + duration + 0.05);
}

/**
 * PERFECT BOARD celebration - full chord then rapid arpeggio.
 * The Peggle moment.
 */
export function playPerfectBoard(): void {
  if (muted) return;
  const ctx = getCtx();
  if (ctx.state !== 'running') return;

  const now = ctx.currentTime;

  // Sustained major chord (C-E-G-C)
  const chordFreqs = [523.25, 659.25, 783.99, 1046.50];
  for (const freq of chordFreqs) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.6);
  }

  // Rapid ascending arpeggio over the chord
  const runNotes = [
    523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77,
    1046.50, 1174.66, 1318.51, 1396.91, 1567.98, 1760.00, 2093.00,
  ];
  for (let i = 0; i < runNotes.length; i++) {
    const t = now + 0.05 + i * 0.04;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = runNotes[i];

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.06, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }
}
