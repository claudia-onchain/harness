// Native balances for the non-EVM, non-Solana families: Bitcoin (mempool.space), Sui, Aptos, TRON, Starknet.
import { fetchJson } from "../core/util.js";
import { rpc } from "./rpc.js";

// Sui public fullnodes dropped JSON-RPC; GraphQL is the keyless path.
export const SUI_GRAPHQL = "https://graphql.mainnet.sui.io/graphql";
async function suiGql(query) {
  const j = await fetchJson(SUI_GRAPHQL, { method: "POST", body: { query } }, 10000);
  if (j.errors?.length) throw new Error(`Sui GraphQL: ${j.errors[0].message}`);
  return j.data;
}

const base = (chain) => String(chain.publicRpc?.[0] || "").replace(/\/+$/, "");

export async function nativeBalance(chain, address) {
  switch (chain.family) {
    case "bitcoin": {
      const j = await fetchJson(`${base(chain)}/address/${address}`, {}, 10000);
      const c = j.chain_stats || {}, m = j.mempool_stats || {};
      const sats = (c.funded_txo_sum - c.spent_txo_sum) + (m.funded_txo_sum - m.spent_txo_sum);
      return { amount: sats / 1e8, txCount: (c.tx_count || 0) + (m.tx_count || 0), pending: (m.funded_txo_sum - m.spent_txo_sum) / 1e8 };
    }
    case "sui": {
      const d = await suiGql(`{ address(address: ${JSON.stringify(address)}) { balance(coinType: "0x2::sui::SUI") { totalBalance } } }`);
      return { amount: Number(d?.address?.balance?.totalBalance || 0) / 1e9 };
    }
    case "aptos": {
      try {
        const v = await fetchJson(`${base(chain)}/accounts/${address}/balance/0x1::aptos_coin::AptosCoin`, {}, 10000);
        return { amount: Number(v) / 1e8 };
      } catch {
        const r = await fetchJson(`${base(chain)}/accounts/${address}/resource/0x1::coin::CoinStore%3C0x1::aptos_coin::AptosCoin%3E`, {}, 10000);
        return { amount: Number(r?.data?.coin?.value || 0) / 1e8 };
      }
    }
    case "tron": {
      const j = await fetchJson(`${base(chain)}/wallet/getaccount`, { method: "POST", body: { address, visible: true } }, 10000);
      return { amount: Number(j?.balance || 0) / 1e6 };
    }
    case "starknet": {
      const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
      const BALANCE_OF = "0x2e4263afad30923c891518314c3c95dbe830a16874e8abc5777a9a20b54c76e";
      const r = await rpc(chain, "starknet_call", [{ contract_address: STRK, entry_point_selector: BALANCE_OF, calldata: [address] }, "latest"]);
      const low = BigInt(r?.[0] || 0), high = BigInt(r?.[1] || 0);
      return { amount: Number((high << 128n) + low) / 1e18 };
    }
    default:
      throw new Error(`Balances for ${chain.family} chains are not supported yet.`);
  }
}

export async function headInfo(chain) {
  const t0 = Date.now();
  switch (chain.family) {
    case "bitcoin": { const h = await fetchJson(`${base(chain)}/blocks/tip/height`, {}, 8000); const fees = await fetchJson(`${base(chain)}/v1/fees/recommended`, {}, 8000).catch(() => null); return { blockNumber: Number(h), latencyMs: Date.now() - t0, fees }; }
    case "sui": { const d = await suiGql("{ checkpoint { sequenceNumber } }"); return { blockNumber: Number(d?.checkpoint?.sequenceNumber), latencyMs: Date.now() - t0 }; }
    case "aptos": { const j = await fetchJson(`${base(chain)}`, {}, 8000); return { blockNumber: Number(j.block_height), latencyMs: Date.now() - t0 }; }
    case "tron": { const j = await fetchJson(`${base(chain)}/wallet/getnowblock`, { method: "POST", body: {} }, 8000); return { blockNumber: j?.block_header?.raw_data?.number, latencyMs: Date.now() - t0 }; }
    case "starknet": { const r = await rpc(chain, "starknet_blockNumber", []); return { blockNumber: Number(r), latencyMs: Date.now() - t0 }; }
    default: throw new Error(`Unsupported family ${chain.family}`);
  }
}
