---
name: approvals-and-revoking
description: "Finds and removes standing token permissions: ERC-20 allowances, Permit2 allowances and signatures, ERC-721/1155 setApprovalForAll operators, Solana SPL delegates and Token-2022 permanent delegates, TRON TRC-20 approvals and EIP-7702 delegations; lists them from Approval events, reads live allowances, ranks risk, and revokes with simulated, human-approved transactions. Use when someone asks \"revoke my approvals\", \"what have I approved\", \"am I exposed to this hack\", \"clean up my wallet\", \"remove unlimited allowance\", after a drainer scare, or before handing a wallet to an agent."
license: MIT
metadata:
  title: "Approvals and revoking"
  category: "crypto-core"
  level: "intermediate"
  tags: "approvals, allowance, revoke, permit2, setApprovalForAll, erc-20, nft, spl delegate, eip-7702, security"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Approvals and revoking

An approval is a standing permission for another address to move your tokens without asking again. Unlimited
allowances to routers, bridges and NFT marketplaces pile up over years, and any one of those spenders being
exploited (or being a drainer from the start) empties the token. Audit by reading live allowances, not just
history, and revoke anything you cannot name or no longer use.

## When to use

- "What have I approved?", "revoke everything I don't use", "clean my wallet".
- A protocol you used was exploited: "am I exposed?".
- After signing something suspicious, or before giving Lumen a wallet.
- Periodic hygiene (monthly for active wallets).

## Steps

1. **Enumerate approvals per chain.** Query logs where `topic1 = owner`:
   - ERC-20 `Approval(owner, spender, value)` topic0 `0x8c5be1e5…`.
   - ERC-721/1155 `ApprovalForAll(owner, operator, approved)` topic0 `0x17307eab…`.
   - Permit2 (`0x000000000022D473030F116dDEE9F6B43aC78BA3`, same on all major EVM chains): its own `Approval`
     and `Permit` events; token-level allowance to Permit2 is usually unlimited by design.
   Use `address_activity`/explorer log APIs or Etherscan V2 `module=logs&action=getLogs` with `chainid=`. Repeat on
   every chain the wallet has used (`get_balance` across chains shows where it is active).

2. **Read the live state.** History lies; current state is what matters.

   ```
   read_contract { "chain": "base", "address": "<token>", "function": "allowance(address,address)", "args": ["<owner>", "<spender>"] }   // 0xdd62ed3e
   read_contract { "chain": "base", "address": "<nft>", "function": "isApprovedForAll(address,address)", "args": ["<owner>", "<operator>"] } // 0xe985e9c5
   read_contract { "chain": "base", "address": "0x000000000022D473030F116dDEE9F6B43aC78BA3", "function": "allowance(address,address,address)", "args": ["<owner>", "<token>", "<spender>"] }
   ```

   Permit2 returns `(uint160 amount, uint48 expiration, uint48 nonce)`; expired = harmless.

3. **Rank the risk.**

   | Situation | Priority |
   |---|---|
   | Spender unverified, unknown, or an EOA | revoke now |
   | Spender involved in a known exploit | revoke now |
   | Unlimited allowance (`2^256-1`) on a valuable token, unused > 90 days | revoke |
   | `setApprovalForAll` to a marketplace you no longer use | revoke |
   | Exact or small allowance to a protocol you actively use | keep |
   | Allowance on a token with ~0 balance | low, but revoke if gas is cheap |

   Name each spender with `contract_abi` (contract name, verification) before deciding.

4. **Build revokes.**
   - ERC-20: `approve(spender, 0)` (`0x095ea7b3`). Some tokens (USDT) require setting 0 before a new value.
   - NFTs: `setApprovalForAll(operator, false)` (`0xa22cb465`); single ERC-721 approvals clear on transfer or via
     `approve(address(0), tokenId)`.
   - Permit2: `approve(token, spender, 0, 0)` or `lockdown([(token, spender), ...])` for several at once.
   - EIP-7702: if the EOA is delegated (code `0xef0100…`) to anything you did not choose, sign a new authorization
     delegating to the zero address, from a clean device.

5. **Simulate, batch, approve.** `simulate_tx` each revoke; show the list (token, spender name, current allowance,
   gas in USD). Revokes are transactions: each goes through `send_tx` with explicit human approval. On L1, revoke
   the high-priority ones first if gas is expensive.

6. **Non-EVM.**
   - Solana: each token account has at most one delegate (`delegate`, `delegatedAmount` in jsonParsed account
     data). Revoke with the SPL `Revoke` instruction (`spl-token revoke <token-account>`). Close empty token
     accounts to reclaim ~0.002 SOL rent (`spl-token close`). Token-2022 `PermanentDelegate` cannot be revoked:
     the only defense is not holding that token.
   - TRON: TRC-20 `approve(spender, 0)` exactly as EVM; check on TronScan's approval page.
   - Sui and Aptos: no ERC-20-style allowances; the risk is signing a malicious transaction block. Starknet
     ERC-20s use `approve` like EVM; also review session keys on smart accounts.

7. **Re-check.** Read allowances again after confirmation and report what remains and why.

## Check before you finish

- [ ] Every chain the wallet has touched was scanned, including Permit2 and NFT operators.
- [ ] Decisions are based on live `allowance`/`isApprovedForAll`, not only past events.
- [ ] Each spender is named (contract name, verified or not) in the report.
- [ ] Revokes were simulated and individually approved by the human.
- [ ] A post-revoke read confirms zero allowances where intended.

## Pitfalls

- **Revoking into a sweeper.** If the wallet's key is compromised, a bot steals the gas you send. Evacuate assets
  to a new wallet first; revoking is for wallets you still control alone.
- **Fake revoke sites.** "Revoke" dapps that ask you to sign Permit2 messages or `setApprovalForAll` are drainers.
  A revoke only ever sets amounts to zero or approvals to false.
- **Forgetting signatures.** Off-chain Permit/Permit2 signatures that were never submitted can still be used until
  their deadline. Invalidate Permit2 nonces (`invalidateNonces`) if you signed one you regret.
- **Missing chains.** The same address on 10 L2s can hold 10 sets of approvals.
- **Breaking live positions.** Revoking a protocol you use means re-approving later; note it.

## Related

- `wallet-and-key-security` — what to do after a compromise.
- `swaps-and-slippage` — exact approvals going forward.
- `airdrop-hygiene` — the claim sites that create bad approvals.
- `contract-verification-and-abi` — naming unknown spenders.
- `multisig-and-safe` — approvals held by team wallets.
