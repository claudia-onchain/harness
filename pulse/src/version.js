// Single source of truth for `pulse --version`, read from package.json so publishing never drifts.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

let v = "0.0.0";
try { v = JSON.parse(readFileSync(join(fileURLToPath(import.meta.url), "..", "..", "package.json"), "utf8")).version || v; } catch { /* packaged oddly */ }
export const VERSION = v;
