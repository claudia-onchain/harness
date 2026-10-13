// 16-bit PCM WAV encoder for AudioBuffer-like data.
export type PcmSource = { numberOfChannels: number; sampleRate: number; length: number; getChannelData: (c: number) => Float32Array };

export function encodeWav(buf: PcmSource): Blob {
  const ch = Math.min(2, buf.numberOfChannels);
  const len = buf.length;
  const bytes = 44 + len * ch * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); view.setUint32(4, bytes - 8, true); w(8, "WAVE");
  w(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, ch, true);
  view.setUint32(24, buf.sampleRate, true); view.setUint32(28, buf.sampleRate * ch * 2, true); view.setUint16(32, ch * 2, true); view.setUint16(34, 16, true);
  w(36, "data"); view.setUint32(40, len * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}
