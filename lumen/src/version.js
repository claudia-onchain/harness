import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./core/paths.js";

export const VERSION = (() => { try { return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version; } catch { return "0.0.0"; } })();
