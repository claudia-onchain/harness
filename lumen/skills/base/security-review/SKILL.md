---
name: security-review
description: "Runs a practical security review of a codebase or change: threat model, secret scanning with gitleaks, dependency audit with npm audit and osv-scanner, static analysis with semgrep, then a manual pass over auth, input handling, injection, SSRF, XSS, file paths, crypto and wallet flows and LLM agent risks, ending in a ranked findings report. Use when someone asks \"security review\", \"is this code safe\", \"audit my app\", \"check for secrets\", \"npm audit\", \"before we launch\" or \"review this PR for security\"."
license: MIT
metadata:
  title: "Security review"
  category: "build"
  level: "advanced"
  tags: "security, appsec, gitleaks, semgrep, npm audit, osv, owasp, ssrf, xss, secrets, threat model"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Security review

A useful review finds the few issues that would actually hurt, proves them, and ranks them. Start from what
an attacker wants (keys, funds, user data, admin access) and where untrusted input enters, run the cheap
scanners to clear the obvious, then spend most of the time reading the code paths that touch money, auth and
outside input. Scanner output is a lead list, not a verdict.

## When to use

- "Do a security review" of a repo, PR or feature before launch.
- "Did I leak any keys?" or a key was just committed.
- Dependency alerts piling up and you need to know which matter.
- An app that signs transactions, holds API keys or runs an LLM agent with tools.

## Steps

1. **Scope and threat model (15 minutes).** List assets (private keys, API keys, user data, funds, admin
   actions), entry points (HTTP routes, webhooks, CLI args, file uploads, websocket messages, LLM inputs), and
   trust boundaries (browser vs server, user vs admin, your code vs third-party APIs). Write it in 10 lines;
   it decides where to look.
2. **Scan for secrets, including history.**
   ```sh
   gitleaks git -v                  # whole git history (gitleaks 8.19+; older: gitleaks detect -v)
   gitleaks dir .                   # working tree, including untracked files
   ```
   Any real hit: rotate the key at the provider first, then purge history if needed. Deleting the line is not a fix.
3. **Audit dependencies.**
   ```sh
   npm audit --omit=dev             # production deps; focus on high/critical with a reachable code path
   npm audit signatures             # registry signatures and provenance
   osv-scanner -r .                 # cross-ecosystem (lockfiles for npm, pip, cargo, go)
   ```
   For each finding ask: is the vulnerable function reachable from untrusted input? Upgrade, override in
   `package.json` `overrides`, or document why it is not exploitable. Check new packages for typosquats and
   `postinstall` scripts.
4. **Run static analysis.**
   ```sh
   semgrep scan --config auto --error
   semgrep scan --config p/javascript --config p/secrets --config p/owasp-top-ten
   ```
   Triage every high-severity hit by reading the code; mark false positives with a reason.
5. **Manual pass over the hot paths.** Use `grep` to find them fast:
   - **Auth:** every route checks identity and ownership server-side (no IDOR: `/api/orders/:id` must check
     the order belongs to the caller). Sessions: `HttpOnly`, `Secure`, `SameSite=Lax` cookies; CSRF on
     cookie-auth writes.
   - **Injection:** parameterized SQL only; `child_process.exec` with interpolated strings is command injection,
     use `execFile`/`spawn` with an args array; no `eval`/`new Function` on input.
   - **SSRF:** server fetches of user-supplied URLs must block private ranges (`127.0.0.0/8`, `10.0.0.0/8`,
     `169.254.169.254`, `::1`) after DNS resolution, and limit redirects.
   - **XSS:** grep `dangerouslySetInnerHTML`, `innerHTML`, `v-html`; sanitize with DOMPurify or render as text.
   - **Paths:** `path.resolve` + prefix check on any file path from input (`../` traversal); limit upload size and type.
   - **Config:** CORS not `*` with credentials; servers bound to 127.0.0.1 when local-only; security headers
     (CSP, `X-Content-Type-Options`); rate limits on login and expensive endpoints; no secrets in logs.
6. **Wallet and on-chain flows.** Private keys never in frontend bundles or `NEXT_PUBLIC_*`; signing shows a
   human-readable preview with chain id, recipient, amount and spender; no unlimited approvals by default;
   server-side checks of on-chain state, never trusting client-reported tx success; RPC keys restricted by
   domain or kept server-side. For contracts, follow `solidity-audit-checklist`.
7. **LLM and agent features.** Outside content wrapped as untrusted data; tools allow-listed per task; every
   side effect (transactions, shell, file writes, posting) behind human approval; output checked for leaked
   secrets. See `prompt-injection-defense`.
8. **Report and verify.** One table, worst first, each with proof and a fix:

   | # | Severity | Where | Issue | Impact | Fix |
   |---|---|---|---|---|---|
   | 1 | Critical | `api/withdraw.js:42` | No ownership check | Any user drains any balance | Check `req.user.id === account.owner` |

   Severity: Critical (funds, keys or all users' data, remotely), High (one user's data or account takeover),
   Medium (needs unusual conditions), Low (hardening). Re-run scanners after fixes and add a test per fixed bug.

## Check before you finish

- [ ] Threat model written: assets, entry points, trust boundaries.
- [ ] gitleaks clean on history and working tree, or every hit rotated.
- [ ] `npm audit --omit=dev` and semgrep high findings each fixed or justified in writing.
- [ ] Auth, injection, SSRF, XSS and path handling reviewed on every entry point that takes input.
- [ ] Money and signing flows show previews and require explicit human approval.
- [ ] Findings report ranked by severity with file:line, impact and fix; fixes verified.

## Pitfalls

- **Dumping scanner output.** 200 unranked alerts get ignored. Triage, dedupe, rank, prove.
- **Fixing the leak, not the key.** A committed key is compromised; rotate it everywhere it was used.
- **Trusting the client.** Hidden fields, disabled buttons and frontend checks are not authorization.
- **Allow-list by string match.** `url.startsWith("https://api.good.com")` passes `https://api.good.com.evil.io`. Parse URLs.
- **Running untrusted code to review it.** Do not `npm install` or run scripts from a suspicious repo on
  your main machine; read first, use a container.
- **Scope creep.** A review that never ends ships nothing. Timebox, report, schedule follow-ups.

## Related

- `code-review` — the general review this extends.
- `wallet-and-key-security` — key storage, rotation and hot-wallet hygiene.
- `solidity-audit-checklist` — smart-contract specific review.
- `prompt-injection-defense` — agent and LLM-specific risks.
- `incident-runbook` — response when a finding is already being exploited.
