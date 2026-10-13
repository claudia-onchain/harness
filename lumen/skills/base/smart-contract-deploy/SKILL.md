---
name: smart-contract-deploy
description: "Deploys and verifies smart contracts on any EVM chain with Foundry (forge script, forge create, forge verify-contract) or Hardhat (Ignition, hardhat verify), including deterministic CREATE2 addresses, Etherscan V2 and Blockscout verification, ownership handoff and zkSync/Abstract caveats. Use when someone asks \"deploy this contract to Base\", \"verify my contract\", \"same address on every chain\", \"forge script broadcast\", or \"hardhat deploy to mainnet\". Every broadcast needs simulation and human approval."
license: MIT
metadata:
  title: "Smart Contract Deploy"
  category: "crypto-core"
  level: "intermediate"
  tags: "deploy, foundry, forge, hardhat, ignition, create2, verification, etherscan, blockscout, evm"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Smart Contract Deploy

A deploy is a one-way door: bytecode, constructor arguments and initial owner are permanent unless you planned an
upgrade path. This skill makes deploys scripted, reproducible, verified and handed to the right owner. The key idea:
the exact same script runs on a fork, then a testnet, then mainnet; nothing is typed by hand at broadcast time.

## When to use

- "Deploy this contract to Base / Arbitrum / Monad", first mainnet launch.
- "Verify my contract on the explorer", unverified bytecode after a deploy.
- "Same address on every chain", deterministic multi-chain deployment.
- Choosing Foundry vs Hardhat for a deploy pipeline.

## Steps

1. **Freeze the build.** Pin `solc` version, optimizer runs and `evm_version` in `foundry.toml` (or
   `hardhat.config`). Chains lagging on opcodes need an older `evm_version` (e.g. `paris` avoids `PUSH0`). Run
   `forge build --sizes` (24,576-byte runtime limit on most EVM chains) and `forge test`.
2. **Store the deploy key in an encrypted keystore.** `cast wallet import deployer --interactive`, then use
   `--account deployer`. Never put a raw private key in `.env` or shell history. Fund it with only what the deploy
   needs: `cast estimate` plus 30% buffer, checked with `gas { "chain": "base" }`.
3. **Write a script, not a command.** `script/Deploy.s.sol`:
   ```solidity
   function run() external {
       vm.startBroadcast();
       Vault v = new Vault{salt: bytes32("vault-v1")}(OWNER, USDC);
       vm.stopBroadcast();
   }
   ```
   The `{salt: ...}` form uses Foundry's default CREATE2 deployer
   (`0x4e59b44847b379578588920cA78FbF26c0B4956C`), giving the same address on every chain where that deployer
   exists and bytecode + args match.
4. **Dry run on a fork.** `forge script script/Deploy.s.sol --fork-url $BASE_RPC --account deployer` (no
   `--broadcast`) prints the transactions and gas. Then broadcast to the testnet:
   `forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --account deployer --broadcast --verify`.
5. **Mainnet broadcast with approval.** In Lumen the deploy transaction goes through `simulate_tx` and then
   `send_tx`, which shows the human the bytecode hash, constructor args, gas and value in `/approvals`. If running
   forge directly via `bash`, the shell call itself needs approval. Keep `broadcast/` artifacts: they record
   addresses and tx hashes per chain.
6. **Verify.** Etherscan V2 (one `ETHERSCAN_API_KEY` for all supported chains):
   `forge verify-contract <addr> src/Vault.sol:Vault --chain base --constructor-args $(cast abi-encode
   "constructor(address,address)" <owner> <usdc>) --watch`. Blockscout chains: `--verifier blockscout
   --verifier-url <explorer>/api/`. Hardhat: `npx hardhat ignition deploy ignition/modules/Vault.ts --network base
   --verify` or `npx hardhat verify --network base <addr> <args...>`. Confirm with
   `contract_abi { "address": "<addr>", "chain": "base" }`.
7. **Hand off ownership.** Transfer `owner` / admin roles to a Safe (`multisig-and-safe`), ideally behind a
   timelock; use two-step `Ownable2Step` so a typo cannot burn ownership. For proxies, confirm `cast implementation`
   and `cast admin` point where you expect, and that the implementation's initializer is disabled.
8. **Record and smoke-test.** `read_contract` key getters on the deployed address; write a deploy record (chain,
   address, tx, block, commit hash, compiler settings, owner) into the repo.

## Chain caveats

| Chain type | Caveat |
|---|---|
| zkSync Era, Abstract | different bytecode and deployer; use `foundry-zksync` (`--zksync`) or `@matterlabs/hardhat-zksync` |
| OP Stack L2s | L1 data fee dominates small deploys; deploy when L1 gas is low |
| Arbitrum | gas estimates include L1 component; `cast estimate` handles it |
| Chains without CREATE2 deployer | deploy the deployer first or use CREATE3 factories |

## Check before you finish

- [ ] Compiler version, optimizer runs and evm_version are pinned and recorded.
- [ ] The script ran on a fork and a testnet before mainnet.
- [ ] The deploy key lives in an encrypted keystore with only gas money on it.
- [ ] The contract is verified and the ABI is retrievable via `contract_abi`.
- [ ] Ownership/admin is a Safe or timelock, transferred with a two-step pattern.
- [ ] A deploy record with addresses and tx hashes is committed.

## Pitfalls

- **Unprotected initializer.** Proxies deployed without calling `initialize` atomically can be front-run and taken.
- **Constructor args mismatch.** Verification fails silently if args differ; encode them with `cast abi-encode`.
- **Wrong chain.** Always pass `--rpc-url` explicitly and check `cast chain-id` before broadcasting.
- **Nonce gaps.** A stuck deploy tx blocks later ones; replace it with the same nonce and higher fee.
- **Copied addresses.** Token and oracle addresses differ per chain; load them from a per-chain config, not memory.

## Related

- `testnet-faucets-and-dev-flow` — the fork and testnet stages
- `contract-verification-and-abi` — verification troubleshooting
- `solidity-audit-checklist` — review before you deploy
- `multisig-and-safe` — the owner the contract should end up with
- `gas-strategy` — timing and pricing the deploy
