---
name: solidity-audit-checklist
description: "A practical Solidity security review checklist: reentrancy (including read-only and cross-function), access control, initializers and upgrade storage layout, oracle manipulation and staleness, ERC-4626 inflation, token quirks (fee-on-transfer, rebasing, 6 decimals, no-return USDT), signature replay, rounding, DoS and L2 specifics, plus Slither, Aderyn, Foundry fuzz/invariant and Halmos runs. Use when someone asks \"audit this contract\", \"review my Solidity\", \"is this contract safe\", \"pre-deploy security check\", or reviews a protocol before depositing."
license: MIT
metadata:
  title: "Solidity Audit Checklist"
  category: "crypto-core"
  level: "advanced"
  tags: "solidity, audit, security, reentrancy, slither, foundry, fuzzing, invariants, upgrades, oracles"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Solidity Audit Checklist

Tools find the shallow bugs; money is lost to logic bugs that only a reviewer who understands the protocol's
invariants will catch. This skill runs the automated pass, then walks a manual checklist ordered by how often each
class has caused real losses. The one idea: write down the invariants first ("total shares never exceed assets
backing them"), then try to break each one.

## When to use

- "Audit / review this contract", pre-deploy security pass on your own code.
- "Is this protocol's contract safe?", reviewing verified source before depositing.
- A PR touching accounting, access control, upgrades or external calls.
- Post-incident: checking whether a known exploit class applies to a fork of the exploited code.

## Steps

1. **Get the exact code.** Your repo at a pinned commit, or verified source:
   `contract_abi { "address": "<addr>", "chain": "ethereum" }` and Etherscan V2
   `module=contract&action=getsourcecode`. For proxies, review the implementation (`cast implementation <addr>`).
2. **Map the system.** List contracts, external entry points, privileged roles, external calls, tokens handled,
   and oracles. Write 3-8 invariants in plain language.
3. **Automated pass.** `slither . --exclude-dependencies`, `aderyn .`, `forge build --sizes`. Triage every High and
   Medium; most are false positives, but write down why.
4. **Manual checklist.** Walk the table below for every external/public function.
5. **Encode invariants as tests.** Foundry fuzz (`forge test --fuzz-runs 10000`) and invariant tests with a handler
   contract (`[invariant] runs = 256, depth = 100`). Halmos (`halmos --function check_`) for symbolic proofs on small
   pure-math functions; Echidna or Medusa for longer campaigns.
6. **Fork-test against reality.** Run the suite on an Anvil mainnet fork with the real tokens and oracles it will use
   (USDT, a fee-on-transfer token, the actual Chainlink feed).
7. **Report findings.** Severity (Critical/High/Medium/Low/Info), location, exploit scenario, proof-of-concept test,
   recommended fix. Distinguish "I proved this" from "this looks risky".

## Manual checklist

| Area | What to check |
|---|---|
| Reentrancy | CEI order; `nonReentrant` on all state-changing entry points sharing state; read-only reentrancy via view functions used by others; ERC-777/721/1155 hooks; transient-storage locks |
| Access control | every privileged function gated; roles granted only in constructor/initializer; no `tx.origin` auth; two-step ownership |
| Initializers & upgrades | `_disableInitializers()` in implementation constructor; `initializer`/`reinitializer` correct; storage layout diff (`forge inspect <C> storageLayout`) append-only; no `selfdestruct`/`delegatecall` reachable in implementation |
| Oracles | no spot DEX price for valuation; Chainlink `updatedAt` staleness vs heartbeat, `answer > 0`, decimals normalized; L2 sequencer uptime feed checked |
| Vault math | ERC-4626 first-depositor inflation (virtual shares / decimals offset / dead shares); rounding favors the vault: round down what users receive (shares on `deposit`, assets on `redeem`), round up what they pay (assets on `mint`, shares on `withdraw`) |
| Token quirks | fee-on-transfer (measure balance delta), rebasing, 6 vs 18 decimals, USDT no-return (use `SafeERC20`), blocklists that can freeze the contract, `approve` race / non-zero-to-non-zero reverts |
| Signatures | EIP-712 domain with `chainId` and `verifyingContract`; nonces and deadlines; `ecrecover` returning address(0); use OZ `ECDSA` against malleability; permit front-running griefing |
| External calls | return values checked; low-level `call` to non-contracts succeeds silently; arbitrary-call targets restricted; gas griefing via returndata |
| DoS | unbounded loops over user-growable arrays; push-payments that revert; reliance on `address(this).balance` |
| Economics | flash-loan manipulable state in one tx; liquidation incentives; fee and slippage bounds; MEV on user-facing actions |
| Chain specifics | `block.number` meaning on L2s (Arbitrum returns L1-ish values); `PUSH0`/opcode support; `selfdestruct` only clears in same tx post-Dencun |

## Check before you finish

- [ ] Code reviewed is pinned to a commit or verified address, implementation included for proxies.
- [ ] Invariants are written down and at least the critical ones are fuzz/invariant-tested.
- [ ] Every Slither/Aderyn High/Medium is triaged with a reason.
- [ ] Each checklist row was considered for each external function.
- [ ] Findings include a severity, a PoC or a clear scenario, and a fix.
- [ ] The report states its scope and that it is not a guarantee of safety.

## Pitfalls

- **Tool output as an audit.** Clean Slither output means nothing about business logic.
- **Reviewing the proxy, not the implementation.** The proxy is 50 lines; the risk is behind it.
- **Mock tokens.** Tests with a perfect ERC-20 miss fee-on-transfer, USDT and rebasing behavior; fork-test.
- **Forks of audited code.** A one-line change to Compound or Uniswap math has drained many forks; diff against the
  upstream commit.
- **Comments and NatSpec are untrusted.** Verify behavior from code, not from what comments claim.
- **Overclaiming.** Say "no issues found in scope" rather than "safe".

## Related

- `smart-contract-deploy` — deploy only after this checklist passes
- `contract-verification-and-abi` — fetching verified source to review
- `oracle-vs-dex-prices` — oracle manipulation in depth
- `chainlink-price-feeds` — correct feed consumption
- `security-review` — broader app and infra security review
