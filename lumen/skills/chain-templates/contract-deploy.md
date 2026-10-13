---
name: "{{chain.id}}-contract-deploy"
description: "{{^bitcoin}}Deploy {{#evm}}a Solidity contract{{/evm}}{{#solana}}a Solana program or SPL token{{/solana}}{{#sui}}a Move package{{/sui}}{{#aptos}}a Move package{{/aptos}}{{#tron}}a TVM (Solidity) contract{{/tron}}{{#starknet}}a Cairo contract{{/starknet}} to {{chain.name}} safely: test first, estimate cost, deploy with preview and approval, verify, and lock down admin keys.{{/bitcoin}}{{#bitcoin}}Explain why Bitcoin has no smart-contract deploys and ship the right alternative instead (Runes, Ordinals, Taproot scripts, or Rootstock and BOB for EVM contracts) with previews and approval.{{/bitcoin}} Use when someone says \"deploy to {{chain.name}}\", \"ship my contract on {{chain.id}}\", \"launch a token on {{chain.name}}\" or \"how much does deploying cost\"."
license: MIT
metadata:
  title: "{{chain.name}}: Contract Deploy"
  category: "chain"
  level: "advanced"
  tags: "{{chain.id}}, {{chain.family}}, deploy, smart contracts, developer"
  version: "1.0.0"
  updated: "2026-10-13"
---

# {{chain.name}}: Contract Deploy

Deploying is the cheap part; the expensive part is shipping something unverified, untested or controlled by a
single hot key. Test on a testnet, rehearse the exact deploy, then deploy once with a preview and explicit
approval. Keys never go into chat or command history: use Lumen's vault or the toolchain's encrypted keystore.

## When to use

- "Deploy this to {{chain.name}}" or "launch a token on {{chain.id}}"
- Estimating what a deploy will cost in {{chain.native.symbol}}
- Moving a tested contract from testnet to {{chain.name}} mainnet
- Setting up upgrade and admin control after a deploy

## Steps

{{#evm}}
1. **Test where it is free.** `forge build && forge test`, then deploy to a testnet (`lumen chains` lists
   them; see `testnet-faucets-and-dev-flow`). Run `solidity-audit-checklist` on anything holding value.
2. **Use a keystore, not a raw key.** `cast wallet import deployer --interactive` stores an encrypted
   key; never pass `--private-key` on the command line.
3. **Rehearse.** Without `--broadcast`, Foundry only simulates:
   `forge script script/Deploy.s.sol --rpc-url https://{{chain.alchemy}}.g.alchemy.com/v2/KEY --account deployer`
   shows gas per transaction; multiply by `gas { "chain": "{{chain.id}}" }` for the cost in
   {{chain.native.symbol}}.
4. **Deploy with approval.** Either path needs an explicit human yes:
   - Through Lumen: build the creation bytecode plus encoded constructor args, run
     `simulate_tx { "chain": "{{chain.id}}", "tx": { "data": "<bytecode+args>" } }`, then the user approves in
     `/approvals` and `send_tx` broadcasts it.
   - Through Foundry, with the user running it (the `bash` tool asks for approval):
     `forge create src/MyToken.sol:MyToken --rpc-url https://{{chain.alchemy}}.g.alchemy.com/v2/KEY --account deployer --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY --chain {{chain.chainId}} --constructor-args <args>`
{{#zk}}
   - ZK caveat: ZKsync Era and Abstract run EraVM and need foundry-zksync (`forge create --zksync`) or
     hardhat-zksync; Linea and Scroll accept standard EVM bytecode.
{{/zk}}
5. **Verify immediately.** If `--verify` was not used or failed, see `{{chain.id}}-contract-verify-and-read`.
   If {{chain.explorer}} is not covered by Etherscan V2 (for example a Blockscout explorer), use
   `--verifier blockscout --verifier-url {{chain.explorer}}/api/`.
6. **Lock down control.** Transfer ownership or admin roles to a multisig, confirm with `read_contract`
   (`owner()`), and record the address, deploy tx and commit hash with `memory_save`.
{{/evm}}
{{#solana}}
1. **Test where it is free.** `anchor build && anchor test`, then deploy to devnet
   (`solana config set --url devnet`; Lumen lists `solana-devnet`).
2. **Budget rent.** A program locks roughly 7 SOL per MB of program data as rent (refundable when closed).
   Check the `.so` size in `target/deploy/` before deploying.
3. **Deploy with approval.** The user runs it with their keypair (the `bash` tool asks first):
   `solana program deploy target/deploy/my_program.so --url <helius url> --with-compute-unit-price <micro-lamports>`
   or `anchor deploy --provider.cluster mainnet`. Failed deploys leave buffer accounts holding SOL; recover
   them with `solana program show --buffers` and `solana program close --buffers`.
4. **Make the build verifiable.** `solana-verify build`, deploy that artifact, then
   `solana-verify verify-from-repo` so explorers show "verified".
5. **Lock down upgrades.** Move the upgrade authority to a multisig (for example Squads) or make the program
   immutable with `solana program set-upgrade-authority <program id> --final`.
6. **Tokens are not programs.** Launching an SPL token uses the existing Token program:
   `spl-token create-token`, mint the supply, then `spl-token authorize <mint> mint --disable` (and `freeze
   --disable`) if the supply is meant to be fixed.
{{/solana}}
{{#bitcoin}}
1. **There is nothing to deploy.** Bitcoin has no general smart-contract layer; Script supports signatures,
   hash locks and timelocks, not programs with state.
2. **Pick the alternative that matches the goal.**
   - Token or collectible: etch a Rune or inscribe Ordinals with `ord` (`ord wallet batch`), after testing on
     signet or testnet.
   - Custody logic (multisig, timelocked inheritance, vaults): Taproot and miniscript descriptors in Sparrow
     or Liana; nothing is deployed, the rules live in the address.
   - Payments: Lightning channels.
   - Full smart contracts with BTC exposure: EVM chains anchored to Bitcoin that Lumen supports, such as
     Rootstock (`rootstock-contract-deploy`) and BOB (`bob-contract-deploy`).
3. **Estimate the cost.** Etchings and inscriptions pay normal fees by size: fee rate from
   `{{chain.publicRpc.0}}/v1/fees/recommended` × vsize. Large inscriptions get expensive fast.
4. **Sign with approval.** The user signs in their own ordinals-aware wallet or `ord`; Lumen prepares and
   checks the plan but never holds the seed.
5. **Record it.** Save the etching or inscription id and txid with `memory_save`.
6. **Confirm on-chain.** Check the transaction on {{chain.explorer}} and the asset on an Ordinals or Runes
   indexer.
{{/bitcoin}}
{{#sui}}
1. **Test where it is free.** `sui move build && sui move test`, then publish to testnet
   (`sui client switch --env testnet`).
2. **Rehearse.** `sui client publish --dry-run` shows gas, storage cost and created objects.
3. **Deploy with approval.** The user runs `sui client switch --env mainnet` then `sui client publish` (the
   `bash` tool asks first). Note the package id and the `UpgradeCap` object it returns; `init` functions run
   exactly once at publish.
4. **Lock down upgrades.** Keep the `UpgradeCap` in a multisig, restrict its policy, or make the package
   immutable (`0x2::package::make_immutable`). Also decide who holds any `TreasuryCap`.
5. **Verify the source.** Publish the source repo and match it on Suiscan or SuiVision; record the package id
   with `memory_save`.
6. **Confirm on-chain.** Open the package on {{chain.explorer}} and call a read function to check `init` ran.
{{/sui}}
{{#aptos}}
1. **Test where it is free.** `aptos move compile --named-addresses my_addr=default` and `aptos move test`,
   then publish to testnet with a testnet profile.
2. **Choose the upgrade policy.** `upgrade_policy = "compatible"` (upgradeable within rules) or
   `"immutable"` in `Move.toml`; immutable cannot be undone.
3. **Deploy with approval.** The user runs
   `aptos move publish --named-addresses my_addr=<account> --profile mainnet` (or `aptos move deploy-object`
   for an object-addressed package); the CLI shows a gas estimate and asks before submitting.
4. **Keep source on-chain.** The CLI uploads package metadata and source by default; that is what explorers
   show as verified code. Do not strip it for production.
5. **Lock down control.** Put the publishing account or object owner behind a multisig account.
6. **Confirm on-chain.** Check the package under the account's modules on {{chain.explorer}} and call a view
   function.
{{/aptos}}
{{#tron}}
1. **Test where it is free.** Compile with TronBox or TronIDE and deploy to the Nile or Shasta testnet first.
   Solidity mostly behaves as on EVM, but addresses, energy and some token behaviours differ.
2. **Budget energy.** Deploys consume a lot of energy; without staked or rented energy the TRX burn can be
   large. Set an explicit `feeLimit` and check `getchainparameters` for current prices.
3. **Deploy with approval.** `tronbox migrate --network mainnet` or TronWeb `contract().new({ abi, bytecode, feeLimit })`,
   run by the user with their key (the `bash` tool asks first).
4. **Verify on TronScan.** Upload source, compiler version and optimizer settings on {{chain.explorer}}.
5. **Lock down control.** Transfer ownership to a multi-signature TRON account (owner and active
   permissions) and record the address with `memory_save`.
6. **Test integrations.** Some TRC-20 tokens have non-standard return values; test against the real token.
{{/tron}}
{{#starknet}}
1. **Test where it is free.** `scarb build` and `snforge test`, then deploy to Sepolia testnet.
2. **Understand declare vs deploy.** Code is declared once as a class (class hash); contracts are instances
   deployed from it. The deployer account must itself be deployed and funded with STRK.
3. **Deploy with approval.** The user runs (the `bash` tool asks first):
   `sncast --account deployer declare --contract-name MyContract --network mainnet`, then
   `sncast --account deployer deploy --class-hash <class hash> --constructor-calldata <args> --network mainnet`
   (or `starkli declare` and `starkli deploy`). Both estimate the STRK fee before sending.
4. **Verify on Voyager.** `sncast verify --contract-address <address> --contract-name MyContract --verifier voyager --network mainnet`.
5. **Lock down upgrades.** If the contract can call `replace_class`, put the admin behind a multisig account
   or remove the upgrade path.
6. **Confirm on-chain.** Open it on {{chain.explorer}} and `sncast call` a read function.
{{/starknet}}

## Check before you finish

- [ ] Tested on a testnet (or signet) with the exact same build and parameters
- [ ] Cost estimated in {{chain.native.symbol}} and shown before anything was sent
- [ ] The deploy was previewed and explicitly approved; no raw key touched chat or shell history
- [ ] Source verified (or the asset confirmed on an indexer) and the address recorded
- [ ] Admin, upgrade and mint powers moved to a multisig or removed, as intended

## Pitfalls

{{^bitcoin}}
- Constructor or init arguments are permanent; a wrong owner or supply means redeploying.
- Deploying from a hot key that later leaks hands over every admin function; move control right away.
- Copy-pasted token templates often include hidden fees or blacklists; read every line you deploy.
- A deploy is not an audit; real money needs a review (`solidity-audit-checklist` or the family equivalent).
{{/bitcoin}}
{{#bitcoin}}
- Rune etching terms (supply, premine, divisibility, mint window) are permanent once mined; test on signet.
- Spending from a non-ordinals-aware wallet can burn inscriptions as fees; use `ord` or an ordinals wallet.
- Custom scripts are easy to make unspendable; test descriptors with small amounts and a recovery path.
- "Smart contracts on Bitcoin" pitches often mean a separate chain with its own trust model; name it.
{{/bitcoin}}

## Related

- `{{chain.id}}-contract-verify-and-read` — verification and reading state
- `{{chain.id}}-gas-and-fees` — cost estimation
- `smart-contract-deploy` — the cross-chain deploy method
- `testnet-faucets-and-dev-flow` — testnet first
- `multisig-and-safe` — admin keys after deploy
