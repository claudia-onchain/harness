---
name: lumen-plugin-authoring
description: "Builds Lumen plugins: CLI plugins in ~/.lumen/plugins/*.js that export agent tools (name, description, JSON Schema parameters, run) and slash commands, and dashboard plugins whose entry module registers panels, Tone.js effects and instruments, and commands. Covers file layout, schemas, safe tool results, testing and enabling via `lumen plugins` or the Plugins page. Use when someone asks \"write a Lumen plugin\", \"add a custom tool\", \"add a slash command\", \"add a dashboard panel\", \"custom synth or effect\" or \"extend Lumen\"."
license: MIT
metadata:
  title: "Lumen plugin authoring"
  category: "build"
  level: "advanced"
  tags: "plugins, lumen, tools, json schema, slash commands, dashboard, tone.js, es modules"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Lumen plugin authoring

A plugin is one ES module in `~/.lumen/plugins/` that adds tools the agent can call, slash commands you can
type, or (for dashboard plugins) panels, sounds and commands in the web UI. Plugins run with your user's full
permissions, so the rule that matters most: a plugin tool returns data and never moves money or bypasses
approvals itself. Anything that signs goes through `send_tx` and the human approval queue.

## When to use

- "Add a tool that queries my internal API / Notion / a niche chain indexer."
- "I want a `/standup` command" or any repeatable slash command.
- "Add a panel to the dashboard" or "a custom bitcrusher effect / FM instrument for the Music studio".
- Wrapping a CLI or MCP server so the agent can call it as a tool.

## Steps

1. **Create the CLI plugin file.** `~/.lumen/plugins/fear-greed.js`, plain ESM, Node 22 built-ins only
   (global `fetch`, `node:fs/promises`); no build step:
   ```js
   async function fetchIndex(days) {
     const res = await fetch(`https://api.alternative.me/fng/?limit=${days}`, { signal: AbortSignal.timeout(10_000) });
     if (!res.ok) return { error: `HTTP ${res.status}` };
     const { data } = await res.json();
     return { source: "alternative.me (untrusted)",
       points: data.map((d) => ({ value: Number(d.value), label: d.value_classification, ts: Number(d.timestamp) })) };
   }

   export default {
     name: "fear-greed",
     version: "1.0.0",
     tools: [{
       name: "fear_greed_index",
       description: "Get the crypto Fear & Greed index for the last N days. Read-only. Use for market mood context.",
       parameters: {
         type: "object",
         properties: { days: { type: "integer", minimum: 1, maximum: 30, default: 1 } },
         additionalProperties: false,
       },
       async run(args, ctx) {
         return fetchIndex(Math.min(Math.max(Number(args.days ?? 1), 1), 30));
       },
     }],
     commands: [{
       name: "mood",
       description: "Print today's Fear & Greed reading",
       async run(args, ctx) {
         const r = await fetchIndex(1);
         return r.error ? `Fear & Greed unavailable (${r.error})` : `Fear & Greed: ${r.points[0].value} (${r.points[0].label})`;
       },
     }],
   };
   ```
   Check what your Lumen version passes in `ctx` before relying on any field; feature-detect (`ctx?.x`).
2. **Write tool descriptions for the model.** Say what it returns, when to use it, and "Read-only" when true.
   Tool names are `snake_case`, unique, and must not shadow built-ins (`get_price`, `send_tx`, `bash`...).
3. **Make schemas strict.** JSON Schema with `type`, `required`, ranges, `enum`s and
   `additionalProperties: false`. Validate again inside `run`: the model can still send junk.
4. **Return small, structured, honest results.** Plain JSON objects, trimmed to what the model needs (under
   ~20 KB), an `error` field instead of throwing for expected failures, and timeouts on every network call.
   Mark third-party text as untrusted (a `source` note, or keep it in a clearly separated field) and never
   return secrets. Read keys from env vars, not hard-coded strings.
5. **Dashboard plugin.** Point the plugin's `entry` at a browser ES module in a subfolder (e.g.
   `entry: "./notes/panel.js"`), so the loader never imports browser code as a CLI plugin. Lumen serves it at `/api/plugins/:id/entry.js` and the dashboard calls its
   default export, `register(api)`:
   ```js
   export default function register(api) {
     api.addPanel({ id: "notes", title: "Notes", route: "/plugins/notes",
       render(el) { el.innerHTML = "<textarea style='width:100%;height:60vh'></textarea>"; } });
     api.addEffect({ id: "crush", name: "Bitcrusher", create: (Tone) => new Tone.BitCrusher(4) });
     api.addInstrument({ id: "fm-bell", name: "FM Bell",
       create: (Tone) => new Tone.PolySynth(Tone.FMSynth, { harmonicity: 3.01, modulationIndex: 14 }) });
     api.addCommand({ name: "notes.clear", description: "Clear the notes panel", params: {},
       run() { const t = document.querySelector("textarea"); if (t) t.value = ""; } });
   }
   ```
   No network imports from random CDNs; bundle dependencies into the entry file. Return Tone nodes from
   `create` and let the studio connect and dispose them.
6. **Check syntax and load it.**
   ```sh
   node --check ~/.lumen/plugins/fear-greed.js
   node -e 'import(process.env.HOME + "/.lumen/plugins/fear-greed.js").then(m => console.log(Object.keys(m.default)))'
   lumen plugins          # list and enable
   ```
   Or enable it on the dashboard `/plugins` page. In the TUI, `/reload` picks up changes.
7. **Test as the agent would.** `lumen -p "What's the market mood this week?"` should call your tool; Ctrl+O
   in the TUI expands the tool card. Test bad input (`days: 999`, missing args) and a network failure.
8. **Version and share carefully.** Bump `version` on changes. Before installing someone else's plugin,
   read every line: it can read your files and keys like any program you run.

## Check before you finish

- [ ] `node --check` passes and the import prints `name, version, tools, commands`.
- [ ] The plugin shows in `lumen plugins` / `/plugins` and toggles on and off cleanly.
- [ ] Every tool has a precise description, strict schema and in-`run` validation.
- [ ] Network calls have timeouts; results are small JSON with an `error` field on failure.
- [ ] No hard-coded keys; no signing, sending or approval logic inside the plugin.
- [ ] Dashboard entry registers without console errors and its panel route renders.

## Pitfalls

- **Side effects in tools.** A plugin tool that posts, pays or deletes skips Lumen's approval queue. Route
  money through `send_tx`; for other writes return a draft and let the user act.
- **CommonJS.** `module.exports` and `require` fail; use `export default`.
- **Huge results.** Returning a 2 MB API response burns context and money. Paginate and summarize.
- **Unwrapped outside text.** Web or API strings returned verbatim can carry injected instructions. Label them.
- **Audio leaks.** Creating Tone nodes in `register` instead of `create` leaks them; create lazily.
- **Name collisions.** Two plugins with the same tool name make tool choice unpredictable. Prefix with your plugin name.

## Related

- `lumen-plugins` — installing, enabling and managing plugins as a user.
- `mcp-integration` — bridging an MCP server into a plugin tool.
- `prompt-injection-defense` — keeping plugin results from steering the agent.
- `api-integration` — robust HTTP clients for the APIs your tools call.
- `music-studio-basics` — where dashboard effects and instruments show up.
