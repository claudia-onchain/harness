// Single-pass pixel pipeline for the Photo studio: brightness, contrast, saturation, hue, look presets
// (LUT-like color transforms), sharpen and vignette. Blur uses Konva's built-in filter.

export type Adjust = { brightness: number; contrast: number; saturation: number; hue: number; blur: number; sharpen: number; vignette: number };
export const ADJUST0: Adjust = { brightness: 0, contrast: 0, saturation: 0, hue: 0, blur: 0, sharpen: 0, vignette: 0 };
export const ADJUST_RANGES: Record<keyof Adjust, [number, number, number]> = {
  brightness: [-1, 1, 0.01], contrast: [-1, 1, 0.01], saturation: [-1, 1, 0.01], hue: [-180, 180, 1], blur: [0, 20, 0.5], sharpen: [0, 1, 0.01], vignette: [0, 1, 0.01],
};

type Px = (r: number, g: number, b: number, l: number) => [number, number, number];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export const PRESETS: Record<string, { label: string; fn: Px | null; swatch: string }> = {
  none: { label: "Original", fn: null, swatch: "linear-gradient(135deg,#555,#999)" },
  "teal-orange": { label: "Teal & Orange", swatch: "linear-gradient(135deg,#0f766e,#f97316)", fn: (r, g, b, l) => { const t = Math.min(1, Math.max(0, (l - 30) / 170)); return [mix(r * 0.62, r * 1.22 + 30, t), mix(g * 1.08 + 14, g * 1.02 + 6, t), mix(b * 1.12 + 34, b * 0.66, t)]; } },
  noir: { label: "Noir", swatch: "linear-gradient(135deg,#000,#ddd)", fn: (_r, _g, _b, l) => { const v = Math.max(0, Math.min(255, (l - 128) * 1.35 + 128)); return [v, v, v]; } },
  vintage: { label: "Vintage", swatch: "linear-gradient(135deg,#7c5a3a,#e9d2a6)", fn: (r, g, b) => [r * 0.393 + g * 0.769 * 0.6 + b * 0.189 * 0.6 + 20, r * 0.349 * 0.6 + g * 0.686 + b * 0.168 * 0.6 + 10, r * 0.272 * 0.6 + g * 0.534 * 0.6 + b * 0.131 + 30] },
  warm: { label: "Golden", swatch: "linear-gradient(135deg,#b45309,#fde68a)", fn: (r, g, b) => [r * 1.1 + 10, g * 1.03 + 4, b * 0.86] },
  cool: { label: "Arctic", swatch: "linear-gradient(135deg,#1e3a8a,#a5f3fc)", fn: (r, g, b) => [r * 0.88, g * 1.0 + 4, b * 1.14 + 12] },
  fade: { label: "Matte", swatch: "linear-gradient(135deg,#3f3f46,#d4d4d8)", fn: (r, g, b) => [r * 0.82 + 28, g * 0.82 + 28, b * 0.82 + 34] },
  vivid: { label: "Vivid", swatch: "linear-gradient(135deg,#db2777,#22d3ee)", fn: (r, g, b, l) => [l + (r - l) * 1.45, l + (g - l) * 1.45, l + (b - l) * 1.45] },
  neon: { label: "Neon night", swatch: "linear-gradient(135deg,#7c5cff,#22d3ee)", fn: (r, g, b, l) => { const t = l / 255; return [mix(r * 0.7 + 30, r * 1.05, t), mix(g * 0.6, g * 1.1 + 10, t), mix(b * 1.3 + 40, b * 1.1, t)]; } },
};

export function makePixelFilter(a: Adjust, preset: string) {
  const bright = a.brightness * 110;
  const c = a.contrast * 255;
  const cf = (259 * (c + 255)) / (255 * (259 - c));
  const sat = 1 + a.saturation;
  const h = (a.hue * Math.PI) / 180;
  const cosA = Math.cos(h), sinA = Math.sin(h);
  // hue rotation matrix (luminance-preserving)
  const m = [
    0.213 + cosA * 0.787 - sinA * 0.213, 0.715 - cosA * 0.715 - sinA * 0.715, 0.072 - cosA * 0.072 + sinA * 0.928,
    0.213 - cosA * 0.213 + sinA * 0.143, 0.715 + cosA * 0.285 + sinA * 0.14, 0.072 - cosA * 0.072 - sinA * 0.283,
    0.213 - cosA * 0.213 - sinA * 0.787, 0.715 - cosA * 0.715 + sinA * 0.715, 0.072 + cosA * 0.928 + sinA * 0.072,
  ];
  const look = PRESETS[preset]?.fn ?? null;
  const doHue = a.hue !== 0;
  const identity = !bright && !a.contrast && !a.saturation && !doHue && !look && !a.sharpen && !a.vignette;

  return function lumenFilter(img: ImageData) {
    if (identity) return;
    const d = img.data;
    const W = img.width, H = img.height;
    if (a.sharpen > 0) {
      const src = new Uint8ClampedArray(d);
      const k = a.sharpen * 1.2;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = (y * W + x) * 4;
          for (let ch = 0; ch < 3; ch++) {
            const v = src[i + ch] * (1 + 4 * k) - k * (src[i - 4 + ch] + src[i + 4 + ch] + src[i - W * 4 + ch] + src[i + W * 4 + ch]);
            d[i + ch] = v;
          }
        }
      }
    }
    const cx = W / 2, cy = H / 2, maxR = Math.hypot(cx, cy);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let r = d[i], g = d[i + 1], b = d[i + 2];
        r += bright; g += bright; b += bright;
        if (a.contrast) { r = cf * (r - 128) + 128; g = cf * (g - 128) + 128; b = cf * (b - 128) + 128; }
        let l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (a.saturation) { r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat; }
        if (doHue) {
          const nr = m[0] * r + m[1] * g + m[2] * b, ng = m[3] * r + m[4] * g + m[5] * b, nb = m[6] * r + m[7] * g + m[8] * b;
          r = nr; g = ng; b = nb;
        }
        if (look) { l = 0.2126 * r + 0.7152 * g + 0.0722 * b; [r, g, b] = look(r, g, b, l); }
        if (a.vignette) {
          const dist = Math.hypot(x - cx, y - cy) / maxR;
          const f = 1 - a.vignette * Math.pow(Math.max(0, dist - 0.25) / 0.75, 1.6);
          r *= f; g *= f; b *= f;
        }
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
    }
  };
}

/** A procedurally painted landscape so the studio (and the demo) always has something to edit. */
export function demoImageDataUrl(w = 1280, h = 800) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const sky = g.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, "#1b1446");
  sky.addColorStop(0.5, "#6d3b8f");
  sky.addColorStop(1, "#f59e6b");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const sun = g.createRadialGradient(w * 0.62, h * 0.58, 10, w * 0.62, h * 0.58, h * 0.32);
  sun.addColorStop(0, "rgba(255,240,200,1)");
  sun.addColorStop(0.25, "rgba(255,190,120,0.9)");
  sun.addColorStop(1, "rgba(255,150,90,0)");
  g.fillStyle = sun;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.7})`; g.fillRect(Math.random() * w, Math.random() * h * 0.35, 1.5, 1.5); }
  const ridge = (y0: number, amp: number, color: string, seed: number) => {
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 - Math.abs(Math.sin(x * 0.004 + seed) * amp + Math.sin(x * 0.013 + seed * 2) * amp * 0.35));
    g.lineTo(w, h);
    g.fillStyle = color;
    g.fill();
  };
  ridge(h * 0.68, 140, "#3b2a63", 1);
  ridge(h * 0.78, 110, "#24193f", 3);
  ridge(h * 0.9, 70, "#120d24", 5);
  const water = g.createLinearGradient(0, h * 0.9, 0, h);
  water.addColorStop(0, "rgba(34,211,238,0.25)");
  water.addColorStop(1, "rgba(124,92,255,0.15)");
  g.fillStyle = water;
  g.fillRect(0, h * 0.92, w, h * 0.08);
  return c.toDataURL("image/jpeg", 0.92);
}
