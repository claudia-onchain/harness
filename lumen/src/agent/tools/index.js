// All built-in tools + plugin tools.
import { ToolRegistry } from "./registry.js";
import { fileTools } from "./files.js";
import { shellTools } from "./shell.js";
import { webTools } from "./web.js";
import { knowledgeTools } from "./knowledge.js";
import { chainTools } from "./chains.js";
import { mediaTools } from "./media.js";
import { screenTools } from "./screen.js";
import { agenticTools } from "./agentic.js";
import { log } from "../../core/log.js";

export function buildTools({ plugins } = {}) {
  const r = new ToolRegistry();
  r.addAll([...fileTools(), ...shellTools(), ...webTools(), ...knowledgeTools(), ...chainTools(), ...mediaTools(), ...screenTools(), ...agenticTools()]);
  for (const p of plugins?.tool || []) {
    if (!p.enabled) continue;
    for (const t of p.tools) {
      if (r.get(t.name)) { log.warn(`plugin ${p.id}: tool ${t.name} clashes with a built-in; skipped`); continue; }
      r.add(t);
    }
  }
  return r;
}
