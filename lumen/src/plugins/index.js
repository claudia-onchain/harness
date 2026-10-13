// Plugins. Tool plugins: ~/.lumen/plugins/*.js (or .mjs) exporting
//   export default { name, version?, description?, tools?: [{ name, description, parameters, run(args, ctx) }], commands?: [{ name, description, run(args, api) }] }
// Dashboard plugins: ~/.lumen/plugins/dashboard/<id>/entry.js (+ optional manifest.json { name, version }),
// served to the dashboard as ES modules at /api/plugins/<id>/entry.js.
import { readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { P, ensureHome } from "../core/paths.js";
import { log } from "../core/log.js";

const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export async function loadPlugins({ config, dir = P.plugins } = {}) {
  ensureHome();
  const disabled = new Set(config?.plugins?.disabled || []);
  const out = { tool: [], dashboard: [], errors: [] };
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).sort()) {
      if (![".js", ".mjs"].includes(extname(f))) continue;
      const id = basename(f, extname(f));
      const file = join(dir, f);
      const entry = { id, name: id, kind: "tool", version: "0.0.0", enabled: !disabled.has(id), file, tools: [], commands: [] };
      if (entry.enabled) {
        try {
          const mod = await import(`${pathToFileURL(file).href}?v=${statSync(file).mtimeMs}`);
          const p = mod.default || mod;
          entry.name = p.name || id; entry.version = p.version || "0.0.0"; entry.description = p.description || "";
          entry.tools = (p.tools || []).filter((t) => t?.name && typeof t.run === "function").map((t) => ({ group: `Plugin: ${entry.name}`, label: t.label || t.name, approval: t.approval || "none", safe: !!t.safe, parameters: t.parameters || { type: "object", properties: {} }, ...t, plugin: id }));
          entry.commands = (p.commands || []).filter((c) => c?.name && typeof c.run === "function");
        } catch (e) {
          entry.error = e.message;
          out.errors.push(`${id}: ${e.message}`);
          log.warn("plugin load failed", id, e);
        }
      }
      out.tool.push(entry);
    }
  }
  const dash = join(dir, "dashboard");
  if (existsSync(dash)) {
    for (const id of readdirSync(dash).sort()) {
      const d = join(dash, id);
      if (!ID_RE.test(id) || !existsSync(join(d, "entry.js"))) continue;
      let manifest = {};
      try { manifest = JSON.parse(readFileSync(join(d, "manifest.json"), "utf8")); } catch { /* optional */ }
      out.dashboard.push({ id, name: manifest.name || id, kind: "dashboard", version: manifest.version || "0.0.0", enabled: !disabled.has(id), entry: `/api/plugins/${id}/entry.js`, dir: d });
    }
  }
  return out;
}

/** Contract shape for /api/plugins. */
export function pluginList(p) {
  return [...p.tool, ...p.dashboard].map(({ id, name, kind, version, enabled, entry, error, description }) => ({ id, name, kind, version, enabled, ...(entry ? { entry } : {}), ...(error ? { error } : {}), ...(description ? { description } : {}) }));
}
