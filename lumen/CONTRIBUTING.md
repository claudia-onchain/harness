# Contributing to Lumen

Thanks for helping. Lumen is plain ES modules on Node 22+, with a React + Vite + TypeScript dashboard under
`dashboard/`. No build step is needed for the CLI itself.

## Set up

```sh
git clone https://github.com/claudia-onchain/harness.git && cd harness/lumen   # or your fork
npm install            # installs the CLI and the dashboard (dashboard/ has its own lockfile)
npm run build          # dashboard → dashboard/dist (optional for CLI work)
npm link               # `lumen` on your PATH, pointing at this checkout
```

`--model mock:echo` runs the whole agent without a key, so most things can be tried offline.

## Before you open a pull request

```sh
npm run check          # node --check on every file, skills/validate.mjs, dashboard typecheck
npm test               # offline unit tests (node:test)
npm run assets         # if you changed README cards (scripts/render-assets.mjs)
```

CI (`../.github/workflows/ci.yml`) runs the same three on Node 22 and 24, Linux and macOS.

## Where things live

| Area | Folder |
| --- | --- |
| Commands and flags | `src/cli/` |
| Agent loop, tools, prompt | `src/agent/` |
| Model clients | `src/llm/` |
| Chains (registry, RPC, prices, quotes, safety gates) | `src/chains/` |
| Media, screen overlays, skills, plugins | `src/media/`, `src/screen/`, `src/skills/`, `src/plugins/` |
| HTTP + WebSocket server (contract in `docs/CONTRACT.md`) | `src/server/` |
| Terminal UI | `src/tui/` |
| Dashboard (React) | `dashboard/src/` |
| Skills shipped with Lumen | `skills/` (`skills/README.md` has the format) |
| Personas | `personas/` |

## Adding things

- **A chain:** one entry in `src/chains/registry.js`; `node scripts/chain-brand-fetch.mjs <id>` fetches its mark for
  the dashboard. Chain skills render automatically.
- **A provider key:** `FIELDS` in `src/core/keys.js` and `PROVIDERS` in `src/core/providers.js`; `node
  scripts/brand-fetch.mjs` fetches its logo.
- **A tool:** `src/agent/tools/`. Tools that can spend or send must go through the approval and cap checks in
  `src/core/approvals.js`.
- **A skill:** a folder with `SKILL.md` under `skills/base/` (or a `{{chain}}` template under `skills/chain/`), then
  `npm run check` validates it.

## Style

Match the surrounding code: small modules, comments that say why, no new dependencies without a reason. Anything
that reads outside content (web pages, token metadata, other people's skills) must wrap it as untrusted; see
`src/core/untrusted.js`.

## Security

Please report vulnerabilities privately to Claudia (claudia-onchain on GitHub) rather than opening a public issue. Never commit keys:
`~/.lumen/` is outside the repo and `.env` is ignored.
