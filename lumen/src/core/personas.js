// Personas: who the agent is. Built-ins in personas/*.md, user ones in ~/.lumen/personas/*.md (same id wins).
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { builtinPersonasDir, P } from "./paths.js";
import { parseFrontmatter } from "./frontmatter.js";

function readDir(dir, source) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => {
    const text = readFileSync(join(dir, f), "utf8");
    const { data, body } = parseFrontmatter(text);
    const id = basename(f, ".md").toLowerCase();
    return { id, name: data.name || id, summary: data.summary || data.description || "", body: body.trim(), source, file: join(dir, f) };
  });
}

export function listPersonas() {
  const map = new Map();
  for (const p of readDir(builtinPersonasDir, "builtin")) map.set(p.id, p);
  for (const p of readDir(P.personas, "user")) map.set(p.id, p);
  return [...map.values()].sort((a, b) => (a.id === "lumen" ? -1 : b.id === "lumen" ? 1 : a.name.localeCompare(b.name)));
}

export function getPersona(id) {
  const all = listPersonas();
  return all.find((p) => p.id === String(id || "").toLowerCase()) || all.find((p) => p.id === "lumen") || { id: "lumen", name: "Lumen", summary: "", body: "You are Lumen, a helpful agent.", source: "fallback" };
}
