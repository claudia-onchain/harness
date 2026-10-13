// Claudia coin data (Solana + Robinhood Chain) via @useclaudia/sdk public reads. No key needed.
let client = null;
async function sdk() {
  if (client) return client;
  const m = await import("@useclaudia/sdk");
  client = { c: new m.ClaudiaClient({}), toTokenKey: m.toTokenKey };
  return client;
}

export async function claudiaCoin({ action = "token", token, query, chain } = {}) {
  const { c, toTokenKey } = await sdk();
  if (action === "trending") return c.insights.trending(chain ? { chain } : {});
  if (action === "hot") return c.insights.hot(chain ? { chain } : {});
  if (action === "search") return c.search(String(query || token || ""), 15);
  if (!token) throw new Error("Give a token (mint, 0x address, sol:<mint> or hood:0x…).");
  let key = String(token);
  try { key = toTokenKey(key) || key; } catch { /* already a key */ }
  return c.insights.token(key);
}
