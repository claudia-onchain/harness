// Hand-rolled ABI helpers for the few calls we decode without viem (Chainlink, ERC-20 basics).
export const SELECTORS = {
  latestRoundData: "0xfeaf968c",
  decimals: "0x313ce567",
  description: "0x7284e416",
  symbol: "0x95d89b41",
  name: "0x06fdde03",
  totalSupply: "0x18160ddd",
  balanceOf: "0x70a08231",
};

const strip = (hex) => String(hex || "").replace(/^0x/, "");
export const word = (hex, i) => strip(hex).slice(i * 64, i * 64 + 64);

export function uint(hex, i = 0) {
  const w = word(hex, i);
  if (!w) throw new Error("ABI decode: missing word");
  return BigInt("0x" + w);
}

export function int(hex, i = 0) {
  const v = uint(hex, i);
  return v >= 1n << 255n ? v - (1n << 256n) : v;
}

/** Decode a dynamic `string` return value, or a bytes32 string (old tokens like MKR). */
export function string(hex) {
  const h = strip(hex);
  if (!h) return "";
  if (h.length === 64) return Buffer.from(h, "hex").toString("utf8").replace(/\0+$/, "");
  const off = Number(uint(h, 0)) / 32;
  const len = Number(uint(h, off));
  return Buffer.from(h.slice((off + 1) * 64, (off + 1) * 64 + len * 2), "hex").toString("utf8");
}

export const padAddress = (addr) => strip(addr).toLowerCase().padStart(64, "0");
export const encodeCall = (selector, ...words) => selector + words.map((w) => (typeof w === "bigint" ? w.toString(16).padStart(64, "0") : padAddress(w))).join("");

/** Chainlink latestRoundData() -> { roundId, answer, startedAt, updatedAt, answeredInRound } (bigints). */
export function decodeLatestRoundData(hex) {
  if (strip(hex).length < 64 * 5) throw new Error("latestRoundData: short return data (is this a Chainlink feed?)");
  return { roundId: uint(hex, 0), answer: int(hex, 1), startedAt: uint(hex, 2), updatedAt: uint(hex, 3), answeredInRound: uint(hex, 4) };
}

/** Scale a bigint by decimals into a JS number (fine for prices). */
export const toNumber = (v, decimals) => Number(v) / 10 ** Number(decimals);
