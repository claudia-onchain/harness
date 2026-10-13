// Long-term memory: a plain Markdown file (~/.lumen/memory/MEMORY.md) the user can edit, plus a keyword search.
import { readFileSync, appendFileSync, existsSync, writeFileSync } from "node:fs";
import { P, ensureHome } from "./paths.js";

const HEADER = "# Lumen memory\n\nOne entry per line. Edit freely; Lumen searches this file.\n\n";

function ensureFile() {
  ensureHome();
  if (!existsSync(P.memoryFile)) writeFileSync(P.memoryFile, HEADER);
}

export function saveMemory(text, tags = []) {
  ensureFile();
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!clean) throw new Error("Nothing to save.");
  const t = (Array.isArray(tags) ? tags : [tags]).filter(Boolean).map((x) => `#${String(x).replace(/[^\w-]/g, "")}`).join(" ");
  const line = `- ${new Date().toISOString().slice(0, 10)} ${clean}${t ? " " + t : ""}\n`;
  appendFileSync(P.memoryFile, line);
  return line.trim();
}

export function allMemories() {
  ensureFile();
  return readFileSync(P.memoryFile, "utf8").split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
}

const words = (s) => String(s || "").toLowerCase().match(/[a-z0-9$#.@-]{2,}/g) || [];

/** Keyword search: score = matched distinct terms (+ tag bonus), newest first on ties. */
export function searchMemory(query, limit = 8) {
  const q = new Set(words(query));
  if (!q.size) return allMemories().slice(-limit).reverse();
  return allMemories()
    .map((line, i) => {
      const w = new Set(words(line));
      let score = 0;
      for (const t of q) if (w.has(t) || w.has(`#${t}`)) score += 1;
      else if ([...w].some((x) => x.startsWith(t) && t.length >= 4)) score += 0.5;
      return { line, score, i };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.i - a.i)
    .slice(0, limit)
    .map((x) => x.line);
}
