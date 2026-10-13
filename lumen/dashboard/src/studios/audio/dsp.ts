// Non-destructive-ish audio edits on AudioBuffers (each returns a new buffer).
let ctx: AudioContext | null = null;
export const audioCtx = () => (ctx ??= new AudioContext());

export function makeBuffer(channels: number, length: number, rate: number) {
  return new AudioBuffer({ numberOfChannels: channels, length: Math.max(1, length), sampleRate: rate });
}
const idx = (b: AudioBuffer, t: number) => Math.max(0, Math.min(b.length, Math.round(t * b.sampleRate)));

export async function decode(data: ArrayBuffer) {
  return audioCtx().decodeAudioData(data);
}

/** Remove [start, end). */
export function cut(b: AudioBuffer, start: number, end: number) {
  const s = idx(b, start), e = idx(b, end);
  const out = makeBuffer(b.numberOfChannels, b.length - (e - s), b.sampleRate);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const src = b.getChannelData(c), dst = out.getChannelData(c);
    dst.set(src.subarray(0, s), 0);
    dst.set(src.subarray(e), s);
  }
  return out;
}

/** Keep only [start, end). */
export function trim(b: AudioBuffer, start: number, end: number) {
  const s = idx(b, start), e = idx(b, end);
  const out = makeBuffer(b.numberOfChannels, e - s, b.sampleRate);
  for (let c = 0; c < b.numberOfChannels; c++) out.getChannelData(c).set(b.getChannelData(c).subarray(s, e));
  return out;
}

function mapRange(b: AudioBuffer, start: number, end: number, f: (v: number, i: number, n: number) => number) {
  const out = makeBuffer(b.numberOfChannels, b.length, b.sampleRate);
  const s = idx(b, start), e = idx(b, end), n = Math.max(1, e - s);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const src = b.getChannelData(c), dst = out.getChannelData(c);
    dst.set(src);
    for (let i = s; i < e; i++) dst[i] = f(src[i], i - s, n);
  }
  return out;
}

export const fadeIn = (b: AudioBuffer, start: number, end: number) => mapRange(b, start, end, (v, i, n) => v * Math.pow(i / n, 1.5));
export const fadeOut = (b: AudioBuffer, start: number, end: number) => mapRange(b, start, end, (v, i, n) => v * Math.pow(1 - i / n, 1.5));
export const gain = (b: AudioBuffer, start: number, end: number, db: number) => { const k = Math.pow(10, db / 20); return mapRange(b, start, end, (v) => Math.max(-1, Math.min(1, v * k))); };
export const silence = (b: AudioBuffer, start: number, end: number) => mapRange(b, start, end, () => 0);

export function peak(b: AudioBuffer, start = 0, end = b.duration) {
  let p = 0;
  const s = idx(b, start), e = idx(b, end);
  for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = s; i < e; i++) p = Math.max(p, Math.abs(d[i])); }
  return p;
}

/** Normalize the range so its peak hits `targetDb` dBFS (default -1). */
export function normalize(b: AudioBuffer, start: number, end: number, targetDb = -1) {
  const p = peak(b, start, end);
  if (p < 1e-6) return b;
  return gain(b, start, end, targetDb - 20 * Math.log10(p));
}

export function reverse(b: AudioBuffer, start: number, end: number) {
  const out = makeBuffer(b.numberOfChannels, b.length, b.sampleRate);
  const s = idx(b, start), e = idx(b, end);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const src = b.getChannelData(c), dst = out.getChannelData(c);
    dst.set(src);
    for (let i = s; i < e; i++) dst[i] = src[e - 1 - (i - s)];
  }
  return out;
}

/** Approximate integrated loudness (RMS-based, ungated) in dBFS — a quick reference, not true LUFS. */
export function rmsDb(b: AudioBuffer) {
  let sum = 0, n = 0;
  for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i += 4) { sum += d[i] * d[i]; n++; } }
  return 10 * Math.log10(sum / Math.max(1, n) + 1e-12);
}
