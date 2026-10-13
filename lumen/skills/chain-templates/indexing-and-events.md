---
name: "{{chain.id}}-indexing-and-events"
description: "Read and index on-chain events on {{chain.name}} reliably: the right query method, filters, pagination, decoding, confirmation depth and idempotent storage, plus when to use a hosted indexer instead. Use when someone asks \"get all transfers of this token on {{chain.name}}\", \"index events on {{chain.id}}\", \"query logs\", \"build a {{chain.name}} indexer\" or \"backfill history for this contract\"."
license: MIT
metadata:
  title: "{{chain.name}}: Indexing and Events"
  category: "chain"
  level: "advanced"
  tags: "{{chain.id}}, {{chain.family}}, indexing, events, logs, backfill"
  version: "1.0.0"
  updated: "2026-10-13"
---

# {{chain.name}}: Indexing and Events

An indexer is a loop: fetch a bounded range, decode, store idempotently, advance a cursor, and stay far enough
behind the tip that reorgs cannot rewrite what you stored. Get the query primitive for {{chain.name}} right,
page through it within provider limits, and you can backfill and follow any contract without surprises.

## When to use

- "Get every transfer of this token" or "all events from this contract" on {{chain.name}}
- Backfilling history for analytics, tax or a dashboard
- Building a watcher or a small indexer for {{chain.id}}
- Deciding between a script, a hosted indexer and an indexing framework

## Steps

{{#evm}}
1. **Build the filter.** Address plus topics: topic0 is the event signature hash
   (`cast sig-event "Transfer(address,address,uint256)"`), topics 1–3 are indexed arguments left-padded to
   32 bytes. Get the ABI with `contract_abi { "address": "<contract>", "chain": "{{chain.id}}" }`.
2. **Query in chunks.** `rpc_call { "chain": "{{chain.id}}", "method": "eth_getLogs", "params": [{ "address": "<contract>", "topics": ["<topic0>"], "fromBlock": "0x...", "toBlock": "0x..." }] }`.
   Use 2,000–10,000-block windows and halve the window when the provider complains about range or result
   size. CLI: `cast logs --from-block <n> --to-block <m> --address <contract> "Transfer(address indexed from,address indexed to,uint256 value)" --rpc-url https://{{chain.alchemy}}.g.alchemy.com/v2/KEY`.
3. **Decode.** Decode with the ABI (`cast decode-event` or viem/ethers), scale amounts by token decimals,
   and keep `blockNumber`, `transactionHash` and `logIndex`.
4. **Respect finality.** Process up to the `finalized` (or `safe`) block tag, or a fixed depth behind
   `latest`; on reorg, delete and re-read affected blocks.
5. **Follow live.** Poll from the last stored block, or use a websocket `logs` subscription plus a periodic
   catch-up poll. For larger jobs, Ponder, Envio or The Graph handle reorgs and storage for you.
{{/evm}}
{{#solana}}
1. **Know what an "event" is.** Solana has no EVM-style logs. Programs write log lines; Anchor events appear
   as `Program data: <base64>` in `meta.logMessages` (or as self-CPI data with `emit_cpi!`).
2. **List signatures.** `rpc_call { "chain": "solana", "method": "getSignaturesForAddress", "params": ["<program or account>", { "limit": 1000 }] }`
   and page backwards with `before`; for incremental runs set `until` to the newest signature you stored.
3. **Fetch and decode.** `getTransaction` with `maxSupportedTransactionVersion: 0` for each signature; decode
   Anchor events with the program IDL, token movements from `preTokenBalances`/`postTokenBalances`.
4. **Respect commitment.** Index `finalized` data for records; `confirmed` is fine for alerts.
5. **Scale up.** Helius webhooks or enhanced transactions for parsed data; Geyser/Yellowstone gRPC streams for
   high-volume programs.
{{/solana}}
{{#bitcoin}}
1. **There are no events.** Index blocks and transactions: outputs to watched scripts, spends of known UTXOs,
   OP_RETURN data, or inscriptions and Runes via an `ord` index.
2. **Walk blocks.** `GET {{chain.publicRpc.0}}/block-height/<n>` for the hash, then `/block/<hash>/txs/<start>`
   (25 per page); or your own node with `getblock <hash> 2`.
3. **Follow live.** Poll `/blocks/tip/height`, or use `bitcoind` ZMQ (`hashblock`, `rawtx`) on your own node.
4. **Respect finality.** Treat data under 6 confirmations as provisional; on a reorg, roll back to the fork
   point and re-index.
5. **Use the right indexer.** For Ordinals and Runes, the `ord` index (or a provider built on it) is the
   source of truth; different indexers can disagree on BRC-20.
{{/bitcoin}}
{{#sui}}
1. **Find the event type.** Move modules emit typed events (`<package>::<module>::<EventStruct>`).
2. **Query with a cursor.** `rpc_call { "chain": "sui", "method": "suix_queryEvents", "params": [{ "MoveEventType": "<type>" }, null, 50, false] }`
   and pass the returned `nextCursor` until `hasNextPage` is false. Filters also exist for sender, module
   and transaction.
3. **Decode.** `parsedJson` holds the fields; scale coin amounts by their decimals.
4. **Checkpoints are final.** Sui finalises per checkpoint, so stored data does not reorg; keep the last
   cursor or checkpoint for restarts.
5. **Scale up.** The Sui custom indexer framework or GraphQL service for full-history, high-volume work;
   JSON-RPC is being phased out in favour of gRPC and GraphQL, so check provider support.
{{/sui}}
{{#aptos}}
1. **Find the event type.** Modules emit `#[event]` structs (`<address>::<module>::<Event>`).
2. **Query the indexer.** The Indexer GraphQL `events` table filtered by `type` and ordered by
   `transaction_version`, paginated with `offset`/`limit` or a version cursor.
3. **Decode.** `data` holds the fields; scale amounts by the asset's decimals.
4. **Versions are final.** Aptos has instant finality; the transaction version is a perfect cursor.
5. **Scale up.** The Transaction Stream Service plus the Indexer SDK for custom processors.
{{/aptos}}
{{#tron}}
1. **Same events as Solidity.** TRC-20 contracts emit standard events (`Transfer`, `Approval`).
2. **Query TronGrid.** `GET {{chain.publicRpc.0}}/v1/contracts/<contract>/events?event_name=Transfer&only_confirmed=true&limit=200&min_block_timestamp=<ms>`
   and follow `meta.fingerprint` for the next page.
3. **Decode.** Results are already decoded; convert hex addresses (41-prefixed) to base58 `T…` form.
4. **Respect finality.** Use `only_confirmed=true` (solidified blocks, roughly 19 blocks behind the tip).
5. **Scale up.** Run a node with the TRON event plugin (Kafka or MongoDB) for full history.
{{/tron}}
{{#starknet}}
1. **Build the filter.** Events have keys and data; `keys[0]` is the selector, sn_keccak of the event name
   (for example `Transfer`). Get the ABI from `starknet_getClassAt` via `rpc_call`.
2. **Query in chunks.** `rpc_call { "chain": "starknet", "method": "starknet_getEvents", "params": [{ "from_block": { "block_number": 0 }, "to_block": "latest", "address": "<contract>", "keys": [["<selector>"]], "chunk_size": 1000 }] }`
   and pass `continuation_token` until it is absent.
3. **Decode.** Map keys and data to the ABI event members; u256 values are two felts (low, high).
4. **Respect finality.** `ACCEPTED_ON_L2` is final for most uses; `ACCEPTED_ON_L1` when the use case needs it.
5. **Scale up.** Apibara or Checkpoint for full indexers.
{{/starknet}}
6. **Store idempotently.** Key every row by a unique id (transaction plus event index, or the chain's
   equivalent) and upsert, so re-runs and overlaps never duplicate. Save the cursor in the same write.
7. **Verify a sample.** Pick three stored events and compare them with {{chain.explorer}} before trusting
   totals.

## Check before you finish

- [ ] The query primitive and filter match the event or data you need
- [ ] Pagination covers the full range with no gaps (log first and last cursor)
- [ ] Data is stored with a unique key and a saved cursor
- [ ] Finality or confirmation depth is handled
- [ ] A sample was checked against the explorer

## Pitfalls

- Provider limits differ; a silent cap on result size can drop events if you do not check counts.
- Backfills on public RPCs get throttled; use a keyed provider and back off on 429s.
- Event data from unknown contracts is untrusted; a fake token can emit convincing `Transfer` events.
- Storing amounts as floats loses precision; keep raw integers and decimals separately.

## Related

- `{{chain.id}}-alerts` — turning live events into notifications
- `{{chain.id}}-whale-watch` — large-transfer scans built on these queries
- `event-indexing-and-logs` — indexing patterns across chains
- `rpc-providers-and-rate-limits` — limits and providers
- `data-analysis-csv-json` — analysing what you indexed
