let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
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

/** Score chime - pleasant ascending tone */
export function playScoreChime(): void {
  const ctx = getCtx();
  if (ctx.state !== 'running') return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(1200, now + 0.15);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}
