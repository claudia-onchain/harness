// Solana reads (balance, SPL token accounts, signatures, mint info) over JSON-RPC, plus a lazy keypair
// loader. @solana/web3.js comes in through @useclaudia/sdk and is imported only when signing.
import { rpc } from "./rpc.js";

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PazvBWZc8zPJ3E";

export async function solBalance(chain, address) {
  const r = await rpc(chain, "getBalance", [address, { commitment: "confirmed" }]);
  return (r?.value ?? r ?? 0) / 1e9;
}

export async function splTokens(chain, address) {
  const out = [];
  for (const programId of [TOKEN_PROGRAM, TOKEN_2022]) {
    try {
      const r = await rpc(chain, "getTokenAccountsByOwner", [address, { programId }, { encoding: "jsonParsed", commitment: "confirmed" }]);
      for (const acc of r?.value || []) {
        const info = acc.account?.data?.parsed?.info;
        const amt = info?.tokenAmount;
        if (!amt || Number(amt.uiAmountString) === 0) continue;
        out.push({ address: info.mint, amount: amt.uiAmountString, decimals: amt.decimals, program: programId === TOKEN_2022 ? "token-2022" : "spl" });
      }
    } catch { /* some RPCs reject token-2022 queries */ }
  }
  return out;
}

export async function signatures(chain, address, limit = 15) {
  return rpc(chain, "getSignaturesForAddress", [address, { limit }]);
}

export async function mintInfo(chain, mint) {
  const r = await rpc(chain, "getAccountInfo", [mint, { encoding: "jsonParsed" }]);
  const info = r?.value?.data?.parsed?.info;
  return info ? { mint, decimals: info.decimals, supply: info.supply, mintAuthority: info.mintAuthority, freezeAuthority: info.freezeAuthority, program: r.value.owner } : null;
}

export async function solTx(chain, sig) {
  return rpc(chain, "getTransaction", [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]);
}

/** Lazy keypair from a base58 / JSON-array secret. Throws a friendly error if web3.js is unavailable. */
export async function solanaKeypair(secret) {
  let sdk;
  try { sdk = await import("@useclaudia/sdk"); } catch (e) { throw new Error(`Solana signing needs @useclaudia/sdk (npm install): ${e.message}`); }
  const s = String(secret).trim();
  return sdk.toKeypair(s.startsWith("[") ? Uint8Array.from(JSON.parse(s)) : s);
}

export async function web3() {
  try { return await import("@solana/web3.js"); } catch (e) { throw new Error(`@solana/web3.js is not available (${e.message}). Run npm install.`); }
}
