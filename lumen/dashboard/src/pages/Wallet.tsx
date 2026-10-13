// Wallet & balances: one address across several chains (read-only).
import { useEffect, useState } from "react";
import { api, errText } from "../lib/api";
import { loadChains } from "../lib/chains";
import { num, usd } from "../lib/format";
import type { BalanceResult, Chain } from "../lib/types";
import { Btn, Empty, PageHeader, Panel } from "../components/ui";
import { ChainDot } from "./Chains";
import { agentProps } from "../takeover/registry";

const DEFAULT = ["ethereum", "base", "arbitrum", "optimism", "polygon", "bnb"];

export default function Wallet() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [picked, setPicked] = useState<string[]>(DEFAULT);
  const [addr, setAddr] = useState(() => { try { return localStorage.getItem("lumen.watchAddr") ?? ""; } catch { return ""; } });
  const [rows, setRows] = useState<Record<string, BalanceResult | { error: string } | "loading">>({});
  useEffect(() => { loadChains().then((r) => setChains(r.chains)); }, []);

  async function scan() {
    const a = addr.trim();
    if (!a) return;
    try { localStorage.setItem("lumen.watchAddr", a); } catch { /* */ }
    const isEvm = /^0x[0-9a-fA-F]{40}$/.test(a) || a.endsWith(".eth");
    const list = picked.filter((id) => { const c = chains.find((x) => x.id === id); return c && (isEvm ? c.family === "evm" : c.family !== "evm"); });
    setRows(Object.fromEntries(list.map((id) => [id, "loading" as const])));
    await Promise.all(list.map(async (id) => {
      try { const r = await api<BalanceResult>(`/api/balance?address=${encodeURIComponent(a)}&chain=${id}`, { timeoutMs: 40000 }); setRows((x) => ({ ...x, [id]: r })); }
      catch (e) { setRows((x) => ({ ...x, [id]: { error: errText(e) } })); }
    }));
  }

  const total = Object.values(rows).reduce((s, r) => (typeof r === "object" && "native" in r ? s + (r.native.usd ?? 0) + r.tokens.reduce((t, k) => t + (k.usd ?? 0), 0) : s), 0);
  return (
    <div className="page">
      <PageHeader title="Wallet & balances" sub="Read-only lookups. Lumen never needs your private key to look; signing is a separate, approval-gated flow." />
      <Panel>
        <div className="row wrap">
          <input className="input mono" style={{ flex: 1, minWidth: 240 }} placeholder="0x… / name.eth / Solana address" value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && scan()} {...agentProps("wallet.address", "Wallet address", "input")} />
          <Btn kind="primary" onClick={scan} agent="wallet.scan" label="Scan balances">Scan</Btn>
        </div>
        <div className="row wrap" style={{ marginTop: 10 }}>
          {chains.map((c) => <button key={c.id} className={`chip ${picked.includes(c.id) ? "on" : ""}`} onClick={() => setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))}>{c.name}</button>)}
        </div>
      </Panel>
      <div className="section-t">Results {total > 0 && <span className="badge ok" style={{ marginLeft: 8 }}>{usd(total)}</span>}</div>
      {Object.keys(rows).length === 0 ? <Empty icon="wallet" title="Enter an address to scan">Pick the chains above; EVM addresses scan EVM chains, other formats scan non-EVM chains.</Empty> : (
        <div className="cards">
          {Object.entries(rows).map(([id, r]) => {
            const c = chains.find((x) => x.id === id)!;
            return (
              <div key={id} className="panel card">
                <div className="card-h"><ChainDot c={c} /><b className="grow">{c.name}</b></div>
                {r === "loading" ? <div className="row small muted"><span className="spinner" /> Loading…</div> : "error" in r ? <div className="small" style={{ color: "var(--bad)" }}>{r.error}</div> : (
                  <div className="col" style={{ gap: 4 }}>
                    <div className="row"><b>{r.native.symbol}</b><span className="grow" /><span className="mono">{num(r.native.amount, 6)}</span><span className="muted small">{usd(r.native.usd)}</span></div>
                    {r.tokens.slice(0, 8).map((t) => <div key={t.address} className="row small"><span>{t.symbol}</span><span className="grow" /><span className="mono">{num(t.amount, 4)}</span><span className="muted">{usd(t.usd)}</span></div>)}
                    {r.tokens.length > 8 && <span className="tiny dim">+{r.tokens.length - 8} more tokens</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
