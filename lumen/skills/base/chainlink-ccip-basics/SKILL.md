---
name: chainlink-ccip-basics
description: "Explains and safely operates Chainlink CCIP for cross-chain tokens and messages: chain selectors, the Router's getFee and ccipSend, EVM2AnyMessage fields, extraArgs (gas limit, out-of-order execution, Solana SVM args), fee tokens, token pools and rate limits, receiver security, finality waits, and tracking or manually executing messages in the CCIP Explorer. Use when someone asks \"send tokens with CCIP\", \"how does CCIP work\", \"what's the chain selector for\", \"my CCIP message is stuck\", \"build a cross-chain app with Chainlink\", or when a bridge route uses CCIP."
license: MIT
metadata:
  title: "Chainlink CCIP basics"
  category: "crypto-core"
  level: "advanced"
  tags: "chainlink, ccip, cross-chain, messaging, bridge, chain selector, router, token pools, rate limits, cct"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Chainlink CCIP basics

CCIP is Chainlink's cross-chain protocol: you call a Router on the source chain with a message (bytes, tokens, or
both), pay a fee, and after source finality the network commits, risk-checks and executes it on the destination.
The three things that break most integrations are the wrong chain selector, too little destination gas in
`extraArgs`, and a receiver that trusts any sender.

## When to use

- "Send USDC/LINK/<CCT token> to another chain with CCIP".
- "How does CCIP work?", "what's the chain selector for Ethereum?".
- "My CCIP message is stuck / failed on the destination".
- Designing a contract that sends or receives cross-chain messages.

## Steps

1. **Look up the lane.** In the CCIP directory (`https://docs.chain.link/ccip/directory/mainnet`) get, for both
   chains: Router address, chain selector (a uint64, not the EVM chain id; Ethereum is `5009297550715157269`),
   supported fee tokens, and whether your token is supported on that lane. Confirm on-chain:
   `read_contract { "chain": "<src>", "address": "<router>", "function": "isChainSupported(uint64)", "args": ["<destSelector>"] }`.

2. **Build the message.**

   ```solidity
   Client.EVM2AnyMessage memory m = Client.EVM2AnyMessage({
     receiver: abi.encode(receiverAddr),          // bytes, ABI-encoded for EVM destinations
     data: payload,                               // empty for token-only transfers
     tokenAmounts: tokens,                        // EVMTokenAmount[] {token, amount}
     feeToken: address(0),                        // 0 = native; or LINK
     extraArgs: Client._argsToBytes(Client.GenericExtraArgsV2({ gasLimit: 200_000, allowOutOfOrderExecution: true }))
   });
   ```

   `gasLimit` is destination gas for your receiver's `ccipReceive`; set 0 for token-only transfers to an EOA.
   Some lanes require `allowOutOfOrderExecution: true`. Solana destinations use SVM-specific extra args (compute
   units, accounts, token receiver); follow the directory's lane notes.

3. **Quote the fee.** `read_contract` `getFee(uint64,(bytes,bytes,(address,uint256)[],address,bytes))` on the
   Router. Paying in LINK is usually cheaper than native. Add a 10–20% buffer for native fees because gas moves
   between quote and send.

4. **Check token pool limits.** Each token pool has outbound/inbound rate limits (bucket capacity and refill
   rate) per lane. A transfer above the remaining capacity reverts at send. Read the pool's
   `getCurrentOutboundRateLimiterState(uint64)` for large amounts. Know the pool type: burn/mint (canonical supply
   moves) vs lock/release (backed by locked tokens on one chain).

5. **Approve, simulate, send.** Approve the Router for the exact token amount (and LINK fee if used), then
   `simulate_tx` the `ccipSend(destSelector, message)` call (with `value` = fee when paying native). Show the human:
   amount, destination chain and receiver, fee, expected time. `send_tx` only after explicit approval; caps in
   `wallet.maxUsdPerTx` apply.

6. **Track.** The `CCIPSendRequested`/`CCIPMessageSent` event carries the `messageId`. Look it up at
   `https://ccip.chain.link` (search tx hash or message id). Status flow: waiting for source finality → committed →
   blessed/risk-checked → success. Ethereum source finality is roughly 15–20 minutes; L2 sources wait for their L1
   batch finality, often longer; fast-finality chains are quicker.

7. **Recover failures.** If destination execution fails (receiver reverted, gas too low), the message shows
   "ready for manual execution". Fix the cause if possible, then manually execute from the Explorer with a higher
   gas limit. Tokens are not lost; they wait for execution.

## Receiver security

```solidity
function _ccipReceive(Client.Any2EVMMessage memory m) internal override {   // CCIPReceiver: onlyRouter
  require(allowedSource[m.sourceChainSelector], "chain");
  require(allowedSender[m.sourceChainSelector][abi.decode(m.sender, (address))], "sender");
  // idempotency: record m.messageId; never revert on business logic you can handle gracefully
}
```

## Check before you finish

- [ ] Chain selectors and Router addresses came from the CCIP directory, not memory or a blog.
- [ ] The token is supported on that exact lane and the amount fits the pool rate limit.
- [ ] `extraArgs` gas limit matches the receiver's real cost (measured, plus margin).
- [ ] Fee quoted with `getFee`, buffer added, fee token approved if LINK.
- [ ] Message id recorded and tracked to success in the CCIP Explorer.

## Pitfalls

- **Chain id instead of selector.** `8453` is not a CCIP selector. Always use the directory's uint64.
- **Empty `extraArgs` defaults.** The default gas limit (200k) may be too low or wastefully high; set it.
- **Receiver reverts on bad input.** That parks the message for manual execution. Handle errors inside the
  receiver and emit events instead.
- **Unrestricted receivers.** Anyone can send a CCIP message to your contract from any chain; allow-list source
  chain and sender.
- **Assuming instant arrival.** Finality waits are real; tell the user the expected window up front.

## Related

- `bridging-with-lifi` — aggregated routes when CCIP is not required.
- `chainlink-price-feeds` — the oracle side of Chainlink.
- `smart-contract-deploy` — deploying sender and receiver contracts.
- `approvals-and-revoking` — exact approvals to the Router.
- `solidity-audit-checklist` — reviewing cross-chain receivers.
