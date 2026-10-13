// Small file helpers: JSON read with default, atomic JSON write (optionally 0600).
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

export function readJson(file, fallback) {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, value, { mode } = {}) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", mode ? { mode } : undefined);
  renameSync(tmp, file);
  if (mode) { try { chmodSync(file, mode); } catch { /* best effort */ } }
}

export function readText(file, fallback = "") {
  try { return readFileSync(file, "utf8"); } catch { return fallback; }
}
