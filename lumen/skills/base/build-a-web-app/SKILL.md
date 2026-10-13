---
name: build-a-web-app
description: "Plans and builds a small-to-medium web app from empty folder to running locally: stack choice, project skeleton, data model, API, UI, auth, validation, tests and a deploy-ready build. Use when someone asks to \"build a web app\", \"make a dashboard\", \"spin up a site with a backend\", \"prototype this idea\", \"add a page and an API route\", or wants an MVP. Opinionated defaults (Vite + React + TypeScript, Node or Next.js, SQLite/Postgres) with a decision table."
license: MIT
metadata:
  title: "Build a web app"
  category: "build"
  level: "intermediate"
  tags: "web app, react, vite, nextjs, node, sqlite, postgres, api, auth, mvp, fullstack"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Build a web app

Most app projects fail from scope, not technology. Pick boring, well-documented tools, build one vertical slice
(one page, one API route, one table) all the way to working, then widen. The one idea that matters: a thin app
that runs end to end today beats a beautiful architecture that runs next week.

## When to use

- "Build me a web app / dashboard / internal tool / landing page with signups"
- Prototyping an idea into a clickable MVP
- Adding a feature that spans UI + API + storage
- Choosing a stack for a new project

## Steps

1. **Write the one-paragraph spec.** Users, the 3 core actions, the data they touch, and what "done" looks like.
   List what is out of scope. If the user gave no constraints, pick defaults from the table and say so.
2. **Choose the stack.**

   | Need | Pick | Why |
   |---|---|---|
   | SPA / dashboard, separate API | Vite + React + TS, Node `http` or Hono | Fast dev loop, no framework lock-in |
   | SEO pages + forms + API in one | Next.js (App Router) or Astro + server routes | SSR, routing, deploy targets |
   | Mostly static content | Astro or plain HTML + a little JS | Zero runtime cost |
   | Single user / local tool | SQLite (`node:sqlite` on Node 22.5+, or better-sqlite3) | No server to run |
   | Multi-user, concurrent writes | Postgres (Neon, Supabase, RDS) | Real constraints, migrations |
   | Auth | Provider (Clerk, Auth.js, Supabase Auth) or signed session cookie | Never hand-roll password storage |

3. **Scaffold and commit the skeleton.** e.g. `npm create vite@latest web -- --template react-ts`. Add scripts
   `dev`, `build`, `test`, `check` (typecheck + lint). Run `npm run dev` once and confirm it serves. These run
   through `bash` with approval. Commit before adding features.
4. **Model the data first.** Write the schema and a migration before any UI: tables, keys, `NOT NULL`, unique
   constraints, `created_at`. Seed 5–10 realistic rows. Constraints in the DB catch bugs no UI validation will.
5. **Build one vertical slice.** One API route with input validation (zod/valibot or hand checks), one page that
   calls it, loading/empty/error states, and one test. Error shape stays consistent:
   `{ "error": { "code": "not_found", "message": "..." } }` with a matching 4xx/5xx status.
6. **Secure the basics as you go.**
   - Secrets in env (`.env` git-ignored, `.env.example` committed); never in client bundles (`VITE_*` vars ship to
     the browser).
   - Parameterized queries only; escape output (React does by default; `dangerouslySetInnerHTML` is a red flag).
   - Cookies `HttpOnly; Secure; SameSite=Lax` (Strict for admin); CSRF protection for cookie-auth forms.
   - Authorization check on every mutating route, server side, by owner id, not by hiding buttons.
   - Local dev servers bind `127.0.0.1`, not `0.0.0.0`.
7. **Widen feature by feature.** Repeat the slice for each core action. Keep components small, fetch logic in one
   module, and server code free of UI imports.
8. **Verify in a browser.** `lumen show --url http://localhost:5173` to open it, then `screen_capture` to look at
   the result, and `screen_show` markers to point the user at what changed. Check keyboard navigation, a 375 px
   width and dark mode if supported.
9. **Make it deployable.** `npm run build` must pass from a clean checkout (`rm -rf node_modules && npm ci`).
   Add a `README` with run steps and env vars, and a health route (`GET /api/health` → `{ ok: true }`).

## Check before you finish

- [ ] `npm ci && npm run build && npm test` pass from a clean checkout
- [ ] Each core action works end to end in a real browser, including empty and error states
- [ ] No secrets in the repo or in the client bundle (`rg -n 'sk-|API_KEY' dist/` returns nothing sensitive)
- [ ] Every mutating route validates input and checks authorization server side
- [ ] Schema has constraints and a migration; seed data loads
- [ ] README lists setup, env vars and scripts

## Pitfalls

- **Starting with auth, theming or a component library.** Build the core slice first; polish later.
- **Client-only validation.** Anyone can call your API with curl; validate on the server.
- **N+1 queries.** A list page doing one query per row; join or batch from day one.
- **State soup.** Global stores for server data; use a fetch cache (TanStack Query, SWR) or route loaders.
- **"Works on my machine."** Undeclared global tools or env vars; the clean-checkout build catches them.
- **Exposing a dev server on the LAN.** `--host` makes your unauthenticated app public on Wi-Fi.

## Related

- `api-integration` — calling third-party APIs from the backend
- `test-writing` — unit, integration and e2e tests for the app
- `deployment-replit-vercel-docker` — shipping it
- `security-review` — a deeper pass before real users arrive
- `project-planning` — breaking a larger app into milestones
