export function usd(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `$${(n / 1e3).toFixed(1)}k`;
  if (a >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (a === 0) return "$0";
  return `$${n.toPrecision(3)}`;
}
export function num(n: number | string | null | undefined, digits = 4) {
  const v = typeof n === "string" ? Number(n) : n;
  if (v === null || v === undefined || !Number.isFinite(v)) return String(n ?? "–");
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e3).toFixed(1)}k`;
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}
export function ago(t: string | number | null | undefined) {
  if (!t) return "";
  const ms = Date.now() - (typeof t === "number" ? (t < 1e12 ? t * 1000 : t) : Date.parse(t));
  if (!Number.isFinite(ms)) return "";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export const short = (s: string | null | undefined, n = 4) => (!s ? "" : s.length <= n * 2 + 3 ? s : `${s.slice(0, n + 2)}…${s.slice(-n)}`);
export const fmtTime = (sec: number) => {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 10);
  return `${m}:${String(s).padStart(2, "0")}.${cs}`;
};
export function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}
export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
