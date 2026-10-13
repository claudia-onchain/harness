---
name: deployment-replit-vercel-docker
description: "Ships a Node or web app to Replit, Vercel or a Docker host: picking the target, env vars and secrets, ports and host binding, build commands, previews vs production, health checks, logs and rollbacks, with real replit, vercel CLI and docker commands. Use when someone asks \"deploy this\", \"put my app online\", \"deploy to Vercel\", \"Replit deployment\", \"write a Dockerfile\", \"it works locally but not in prod\" or \"roll back the deploy\"."
license: MIT
metadata:
  title: "Deployment: Replit, Vercel, Docker"
  category: "build"
  level: "intermediate"
  tags: "deployment, vercel, replit, docker, dockerfile, env vars, secrets, rollback, health check, ci"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Deployment: Replit, Vercel, Docker

Pick the target by the shape of the app: Vercel for static sites, Next.js and short request/response functions;
Replit for quick full-stack apps and bots with built-in secrets and one-click deploys; Docker for anything
long-running (websockets, workers, cron, bots) that you want to run the same way on any VPS or container host.
Whatever the target: config comes from env vars, secrets never enter git or images, and every deploy has a
health check and a known rollback. Do not deploy the Lumen dashboard itself: it is local-only by design.

## When to use

- "Deploy this app / bot / API" or "put it online".
- Moving from `localhost` to a public URL and things break (ports, env, file writes).
- Writing a Dockerfile or `.dockerignore` for a Node service.
- A bad deploy needs rolling back fast.

## Steps

1. **Prepare the app.** One start command (`npm start`), `"engines": { "node": ">=22" }` in `package.json`,
   listen on `process.env.PORT`, a `GET /healthz` that returns 200 only when dependencies are reachable, and
   a `.env.example` listing every variable (names only). Run `npm ci && npm run build && npm start` from a
   clean clone first.
2. **Replit.** Import the repo, set secrets in the Secrets pane (they arrive as env vars), and make `.replit` explicit:
   ```toml
   run = "npm start"
   [[ports]]
   localPort = 3000
   externalPort = 80
   ```
   Bind to `0.0.0.0`, not `localhost`. In the Deploy pane pick Autoscale (stateless web), Reserved VM
   (always-on bots, websockets), Static, or Scheduled (cron-style jobs). Local disk on Autoscale is not
   persistent: use a database or object storage.
3. **Vercel.**
   ```sh
   npm i -g vercel
   vercel link                          # connect the folder to a project
   vercel env add DATABASE_URL production
   vercel env pull .env.local           # sync for local dev; .env.local stays gitignored
   vercel                               # preview deployment with its own URL
   vercel --prod                        # production
   vercel logs <deployment-url>
   vercel rollback                      # instant revert to the previous production deployment
   ```
   Functions are short-lived: no long-running websockets or background loops, the filesystem is read-only except
   `/tmp`, and duration is capped (raise `maxDuration` per function in `vercel.json` within your plan's limit).
   Variables prefixed `NEXT_PUBLIC_` ship to the browser: never put secrets or RPC keys there.
4. **Docker.** Multi-stage, non-root, small:
   ```dockerfile
   FROM node:22-slim AS deps
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --omit=dev

   FROM node:22-slim
   ENV NODE_ENV=production
   WORKDIR /app
   COPY --from=deps /app/node_modules ./node_modules
   COPY . .
   USER node
   EXPOSE 3000
   HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
   CMD ["node", "server.js"]
   ```
   `.dockerignore`: `node_modules`, `.git`, `.env*`, `*.log`, `dist` if built in-image. Then:
   ```sh
   docker build -t myapp:1.4.0 .
   docker run --rm -p 3000:3000 --env-file .env myapp:1.4.0
   docker buildx build --platform linux/amd64 -t registry.example.com/myapp:1.4.0 --push .   # from Apple Silicon to x86 hosts
   ```
   Tag with versions or git SHAs, never only `latest`, so rollback is `docker run` of the previous tag.
5. **Secrets.** Store them in the platform (Replit Secrets, `vercel env`, `--env-file` or the host's secret
   store). Scan before the first push: `gitleaks git -v` (or `gitleaks detect -v` on older versions). A key
   that was ever committed is rotated, not just deleted.
6. **Verify after deploy.** `curl -fsS https://<host>/healthz`, click the main flow, check logs for errors in
   the first 10 minutes, and confirm env-dependent features (database, payments, RPC) actually work.
7. **Keep a rollback ready.** Write down the exact command before deploying: `vercel rollback`, redeploy the
   previous Replit deployment from its history, or run the previous Docker tag. Database migrations must be
   backward compatible for one release so rollback does not break.

## Choosing quickly

| Need | Pick |
|---|---|
| Static site, Next.js, light API | Vercel |
| Fast full-stack prototype, Discord/Telegram bot, scheduled job | Replit (Reserved VM or Scheduled) |
| Websockets, workers, queues, self-hosting, portability | Docker on a VPS or container host |

## Check before you finish

- [ ] App listens on `PORT` and binds `0.0.0.0` (Replit/Docker); `/healthz` returns 200 in production.
- [ ] All secrets live in the platform's secret store; `gitleaks` is clean and `.env*` is ignored.
- [ ] Production URL works end to end, not just the homepage.
- [ ] Logs are reachable (`vercel logs`, Replit deployment logs, `docker logs`).
- [ ] The rollback command is written down and the previous version still exists.

## Pitfalls

- **Binding to localhost.** Inside containers and Replit it makes the app unreachable. Bind `0.0.0.0`.
- **Writing to local disk.** Serverless and autoscaled instances lose files. Use storage built for it.
- **Arch mismatch.** Images built on Apple Silicon fail on amd64 hosts with `exec format error`. Use `--platform`.
- **Secrets in build args or layers.** `ARG`/`ENV` values and copied `.env` files stay in image history.
- **Public dev servers.** Do not expose admin tools, debug ports or the Lumen dashboard to the internet.
- **Wallet keys on servers.** A hot key on a public server is a target; keep signing on a human-approved path.

## Related

- `build-a-web-app` — building the app you are about to ship.
- `security-review` — scan code, deps and secrets before going public.
- `incident-runbook` — what to do when a deploy breaks production.
- `git-workflow` — tags and branches that make rollbacks easy.
- `automation-and-cron` — scheduled jobs on the server side.
