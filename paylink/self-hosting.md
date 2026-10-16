# Self-hosting

How to set up, run and deploy Paylink yourself. The hosted service runs at `https://paylink.useclaudia.xyz`; the
same code runs anywhere Node runs.

One deployable, `apps/gateway`, serves the API, the web app (dashboard, checkout, marketing site, docs, operator
console) and the background worker. It is a pnpm monorepo:

```
apps/gateway/          the product: API, worker and web app in one deployable
  server/              Express API, domain logic, chain access, background jobs
    agent/             the tool list shared by Paylink and MCP, and Paylink's model loop
  client/              React dashboard, checkout, marketing site, docs, operator console
  shared/              schema, API object types, brand, networks, permissions
  migrations/          versioned SQL, applied automatically at boot
  scripts/             smoke test, preflight, key generators, sweep signer, demo seeder
  tests/               vitest suites
packages/node/         the @paylink/node server SDK
docs/                  architecture, operations, security, and these docs
```

> **Legal note.** Taking custody of other people's funds is regulated in most places. Get advice on
> money-transmission licensing before running custodial settlement for third parties, or offer direct settlement
> only.

## Requirements

| | |
|---|---|
| Node.js | **20.11 or newer** (CI uses 22; Replit uses 24) |
| pnpm | 10.26.1, via Corepack (`corepack enable`) |
| Postgres | **Optional in development**: with no `DATABASE_URL`, an embedded Postgres (PGlite) runs on local disk. **Required in production**: a managed Postgres. |
| Chain RPC | Optional. Public RPCs are used by default; an Alchemy key gives every chain a dedicated endpoint. |
| Model API | Optional. `ANTHROPIC_API_KEY` switches on Paylink, the dashboard agent. |

## Run it locally

```bash
git clone <your fork of this repository> paylink
cd paylink
corepack enable
pnpm install
pnpm dev            # http://localhost:5000, embedded Postgres in apps/gateway/.data
```

No `.env` is needed for development. On first boot the server migrates the database, seeds the token registry
and the platform's test-mode derivation keys, and starts the worker. Open `http://localhost:5000/connect` and either sign in with a
browser wallet or click **Explore with a demo account**. With no `ADMIN_WALLETS`, the first wallet to sign in to a
fresh local database becomes a platform admin (development only).

## Commands

From the repository root:

| Command | What it does |
|---|---|
| `pnpm dev` | API, worker and Vite dev server on `:5000`, with reload. |
| `pnpm test` | All test suites: vitest on an in-memory Postgres and the simulated chain, plus the SDK tests. |
| `pnpm typecheck` | TypeScript for client, server and SDK. |
| `pnpm build` | Production bundle: Vite builds the web app, esbuild bundles the server to `apps/gateway/dist`; the SDK compiles. |
| `pnpm start` | Runs the production bundle (`NODE_ENV=production node dist/index.js`). |
| `pnpm db:generate` | Generates a new SQL migration from changes to `shared/schema.ts`. |
| `pnpm preflight` | Go-live readiness report (see below). |
| `pnpm smoke -- <url>` | End-to-end check against a running server (see below). |

Workspace-only scripts (run with `pnpm --filter @paylink/gateway run <script>`):

| Script | What it does |
|---|---|
| `worker` | Runs the production bundle as a worker only (`PROCESS_ROLE=worker`). |
| `test:watch` | vitest in watch mode. |
| `generate:escrow-key` | Generates an EVM custody mnemonic and its account-level xpub, offline. |
| `generate:bitcoin-escrow-key` | Same for Bitcoin (`m/44'/0'/0'/0`, legacy P2PKH addresses). |
| `generate:solana-escrow-key` | Generates a Solana custody seed, offline. |
| `seed:demo -- 0xYourWallet` | Seeds a test-mode demo account for a wallet, through the real domain code. |

## Environment variables

Copy `.env.example` to `.env` for local runs (never commit it). On Replit, set these as Secrets. Everything is
validated at boot; a misconfigured deploy fails immediately with a message that says what to fix.

### Core

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` turns on secure cookies, CSP/HSTS, mainnet defaults and production requirements. Set by `pnpm start`. |
| `PORT` | `5000` | |
| `DATABASE_URL` | unset | Postgres connection string. Unset: embedded PGlite under `DATA_DIR`. **Required in production.** |
| `DATA_DIR` | `.data` | Where embedded Postgres keeps its files. |
| `DATABASE_POOL_SIZE` | `10` | 2 to 100. |
| `SESSION_SECRET` | dev-only value | **Required in production**: 32+ random characters. `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `ADMIN_WALLETS` | unset | **Required in production**: comma-separated operator wallet addresses (platform admins). |
| `APP_URL` | `http://localhost:<PORT>` | Public origin used in links, QR codes, webhook payloads, the embed script and sign-in messages. Hosted: `https://paylink.useclaudia.xyz`. |
| `PROCESS_ROLE` | `all` | `web` (HTTP only), `worker` (jobs only) or `all`. Several instances are safe: jobs are leader-elected. |
| `TRUST_PROXY` | `1` | Proxies in front of the app (Replit and most PaaS: 1). Drives client IPs and rate limits. |
| `SESSION_COOKIE_SECURE` | on in production | Only turn off to run a production build over plain http in CI. |
| `DEMO_LOGIN` | on in development, off in production | Demo wallet sign-in with a seeded test account. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`. Logs are structured JSON with request ids. |

### Chains and custody

| Variable | Default | Notes |
|---|---|---|
| `CHAIN_ENV` | `mainnet` in production, `testnet` otherwise | Which network set live payments use. |
| `ALCHEMY_API_KEY` | unset | Dedicated RPC for every chain; without it, public RPCs are used. |
| `ESCROW_XPUB` | unset | Platform EVM custody key: the **account-level xpub** at `m/44'/60'/0'/0`. Never a private key. Without it (or one registered in the operator console), custodial live payments are disabled. |
| `BITCOIN_ESCROW_XPUB` | unset | Platform Bitcoin custody key (`m/44'/0'/0'/0`), watch-only. |
| `SOLANA_ESCROW_SEED` | unset | Platform Solana custody seed, 64 hex characters. **Spend-capable**: Ed25519 has no watch-only xpub, so the server holds this seed. Keep it in a secret manager only. |
| `BITCOIN_API_MAINNET` | `https://blockstream.info/api` | Esplora-compatible REST API. |
| `BITCOIN_API_TESTNET` | `https://blockstream.info/testnet/api` | |
| `VITE_REOWN_PROJECT_ID` | unset | WalletConnect / Reown project id (cloud.reown.com) for phone wallets. `REOWN_PROJECT_ID` is also read. |

### Money policy

| Variable | Default | Notes |
|---|---|---|
| `PLATFORM_FEE_BPS` | `50` | Platform fee in basis points (0.5%). An account may override it. |
| `DEFAULT_MAX_PAYMENT_USD` | `50000` | Largest single live payment. An account may override it. |
| `UNVERIFIED_DAILY_LIMIT_USD` | `5000` | Live volume per rolling 24 hours for unverified accounts. |
| `REQUIRE_VERIFICATION_FOR_PAYOUTS` | `false` | Require a verified business for live payouts. |
| `PAYOUT_DESTINATION_COOLDOWN_HOURS` | `24` | Cooling-off before a new payout address can be used (0 to 168). |
| `LATE_PAYMENT_WATCH_HOURS` | `72` | How long an address is watched after its quote expires (1 to 720). |

### Pricing

| Variable | Default | Notes |
|---|---|---|
| `COINGECKO_API_KEY` | unset | Optional key for the price feed. |
| `PRICE_MAX_AGE_SECONDS` | `120` | Oldest a price may be and still quote a volatile asset. |
| `PRICE_MAX_DEVIATION_BPS` | `200` | Refuse a quote when price sources disagree by more than this. |
| `STABLE_DEPEG_BPS` | `150` | A stablecoin further than this from $1 stops being offered. |

### Compliance

| Variable | Default | Notes |
|---|---|---|
| `SANCTIONS_LIST_URLS` | OFAC SDN digital-currency list | Comma-separated URLs of address lists (one `0x` address per line). Refreshed daily. |
| `CHAINALYSIS_API_KEY` | unset | Adds Chainalysis sanctions screening on top of the list. |
| `WEBHOOKS_ALLOW_INSECURE` | on in development, off in production | Allows `http://` and private-network webhook URLs. Never in production. |

### Paylink, the AI shopkeeper

| Variable | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | unset | Without it the dashboard panel says Paylink is off. The MCP server works either way (outside agents bring their own model). |
| `PAYLINK_MODEL` | `claude-haiku-5-5` | Model for the shopkeeper. |
| `PAYLINK_ACCOUNT_DAILY_USD` | `0.05` | Model spend cap per account per UTC day. |
| `PAYLINK_PLATFORM_DAILY_USD` | `0.5` | Model spend cap for the whole platform per UTC day. |

### Worker cadence and email

| Variable | Default | Notes |
|---|---|---|
| `SETTLEMENT_INTERVAL` | `15` | Seconds between live settlement sweeps. 0 disables. |
| `WEBHOOK_INTERVAL` | `5` | Seconds between webhook delivery runs. 0 disables. |
| `RESEND_API_KEY` | unset | Customer email (invoices, reminders, receipts, refund claim links) via Resend. |
| `MAIL_FROM` | — | Sender, e.g. `"Payments <payments@example.com>"`. |

## Database and migrations

- Migrations are versioned SQL files in `apps/gateway/migrations`, applied **automatically at boot** under a
  Postgres advisory lock, so only one of several starting instances migrates.
- To change the schema: edit `apps/gateway/shared/schema.ts`, run `pnpm db:generate`, review the generated SQL,
  commit it.
- **Never run `drizzle-kit push` against a database holding money**: it diffs live and can drop columns.
- All tables live in the `gateway` schema. The ledger's double-entry, append-only and no-overdraft rules are
  enforced by database triggers and constraints (see [ARCHITECTURE.md](../ARCHITECTURE.md)).
- The embedded PGlite database is for development and previews only.

## Custody keys

The server holds only **public** keys for EVM and Bitcoin. It derives and watches addresses but cannot spend from
them. Payouts are signed outside the server, by the treasury multisig.

**For real money**, generate keys on a hardware wallet or an MPC/HSM custody provider and export only the
account-level xpub. The scripts below exist so a test deployment can be set up end to end. Run them on a machine
that is not connected to anything, write the words on paper, and clear the terminal.

```bash
# EVM: prints a 24-word mnemonic and the xpub at m/44'/60'/0'/0 -> ESCROW_XPUB
pnpm --filter @paylink/gateway run generate:escrow-key

# Bitcoin: mnemonic and the xpub at m/44'/0'/0'/0 -> BITCOIN_ESCROW_XPUB
pnpm --filter @paylink/gateway run generate:bitcoin-escrow-key

# Solana: a 32-byte seed (64 hex characters) -> SOLANA_ESCROW_SEED
pnpm --filter @paylink/gateway run generate:solana-escrow-key
```

Register the EVM key with `ESCROW_XPUB` or in the operator console under **Custody keys**. Pasted private keys
(`xprv`) and keys at the wrong depth are refused.

The Solana seed is different: Ed25519 cannot derive child public keys from a parent public key, so the server
must hold the seed and can spend every Solana address it has issued. Paste it only into the platform's secret
manager.

Merchants who choose **direct settlement** register their own EVM xpub under **Settings → Settlement**; their
live EVM payments then land in their own wallet.

Consolidating custodial funds (sweeping) uses an offline signer; see [OPERATIONS.md](../OPERATIONS.md#sweeping):

```bash
MNEMONIC="…24 words…" FUNDER_PRIVATE_KEY=0x… \
  pnpm --filter @paylink/gateway exec tsx scripts/sweep-sign.ts \
  --plan plan.json --to 0xTreasury --chain-id 8453 --max-fee-gwei 0.2 --priority-gwei 0.01
```

## The $PAYLINK token address

The **$PAYLINK** contract address on Solana is not in the code. A platform admin sets it in the operator console
under **Token address** (`/admin/ca-config`), and the public site shows it from there. Until it is set, nothing is
shown.

## Deploying on Replit

The repository includes a `.replit` file.

**Preview (development).** Import the repository and press **Run**. It installs, migrates an embedded Postgres,
seeds the token registry and starts on port 5000. Click **Explore with a demo account** on the sign-in page.

**Production deployment.**

1. **Secrets.** In the Repl's Secrets, set at least:

   | Secret | Value |
   |---|---|
   | `APP_URL` | `https://paylink.useclaudia.xyz` |
   | `SESSION_SECRET` | 32+ random characters |
   | `ADMIN_WALLETS` | Your operator wallet addresses, comma-separated |
   | `DATABASE_URL` | A managed Postgres connection string |
   | `CHAIN_ENV` | `mainnet` |
   | `ALCHEMY_API_KEY` | Recommended |
   | `ESCROW_XPUB` | Your platform custody xpub (or register it in the console later) |
   | `ANTHROPIC_API_KEY` | If you want the Paylink agent |

2. **Deployment type.** Use an **always-on Reserved VM**. The settlement worker must never scale to zero, or
   payments stop confirming. The checked-in `.replit` declares `deploymentTarget = "cloudrun"` (autoscale); change
   the deployment type to Reserved VM when you publish.
3. **Build and run commands** (already in `.replit`):
   - build: `corepack enable; pnpm install --frozen-lockfile && pnpm run build`
   - run: `pnpm run start`
4. **Custom domain.** In the deployment's settings, link the domain `paylink.useclaudia.xyz` and add the DNS
   records Replit shows you at your DNS provider. Keep `APP_URL` equal to that origin: wallet sign-in messages are
   bound to the domain the visitor sees, and links, QR codes and webhook payloads are built from `APP_URL`.
5. **Demo sign-in.** The checked-in `.replit` sets `DEMO_LOGIN = "true"` for production. The demo account is a
   shared, passwordless test-mode account with no operator access. Remove that line (or set it to `false`) if you
   do not want the demo button on your live site.
6. Run **preflight** with the production environment (below), then deploy.

**Other hosts.** Any platform that can run `pnpm install --frozen-lockfile && pnpm run build` then
`pnpm run start` works. Keep at least one always-on process with `PROCESS_ROLE=all` or `worker`. To scale, run
`PROCESS_ROLE=web` behind a load balancer and one or more `PROCESS_ROLE=worker` instances.

## Preflight

```bash
pnpm preflight
```

Run it with the production environment loaded before each launch. It separates **blockers** (the server will not
boot: `SESSION_SECRET`, `ADMIN_WALLETS`, a production `DATABASE_URL`) from **warnings** (it boots, degraded: no
`APP_URL`, no custody key, public RPCs, OFAC-only screening, unverified payouts allowed), then probes each live
chain's RPC, the price feeds (CoinGecko, Coinbase), FX rates and the sanctions list. It exits non-zero if there
are blockers. Example output:

```
  ok     DATABASE_URL                      set
  ok     SESSION_SECRET                    64 characters
  WARN   ESCROW_XPUB                       unset: custodial live payments are disabled until a custody key is registered …
  ok     RPC Base                          212ms, block 21843390
  …
0 blocker(s), 3 warning(s)
```

## Smoke test

```bash
pnpm smoke                                   # against http://localhost:5000
pnpm smoke -- https://paylink.useclaudia.xyz # against a deployment
```

It signs in with a freshly generated wallet (a real EIP-4361 signature), creates an account and a test-mode API
key, then drives the public API through a full payment lifecycle on the simulated chain: intent, attempt,
settlement, balance, refund, payout, events, idempotency and errors. Everything it creates is namespaced by a run
id and lives in test mode, so it is safe to run repeatedly against production. It exits non-zero on any failure.

CI (`.github/workflows`) runs typecheck, tests, build, then starts the built server and runs the smoke test
against it.

## Health and monitoring

| Endpoint | Use |
|---|---|
| `GET /healthz` | Liveness. |
| `GET /readyz` | Readiness: database up, and whether the settlement worker ran recently. `503` if the database is down. |
| `GET /metrics` | Prometheus: HTTP status classes, each job's last run time and health. |
| `/status` | Public status page: jobs, chain reachability, price sources, 24-hour volume. |

Background jobs (leader-elected, one instance runs them): price and FX refresh, test and live settlement sweeps,
intent expiry, webhook delivery, test payouts, scheduled payouts, batch verification, invoice reminders,
subscription renewals, wrong-network scans, hourly reconciliation of ledger against chain balances, daily
sanctions refresh, retention cleanup, and email.

Day-to-day operator work (outbound batches, compliance reviews, reconciliation, incidents) is in
[OPERATIONS.md](../OPERATIONS.md).

## Rebranding

Product names, the webhook and version header names, the session cookie, the SDK package name and the docs
snippets all come from `apps/gateway/shared/brand.ts`. Changing `webhookPrefix` after integrators exist is a
breaking change for them (their signature checks read the header by name).
