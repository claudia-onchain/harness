// Chains: chip grid (accent, family, Alchemy/public source) → live status, price lookup and balance lookup.
import { useEffect, useMemo, useState } from "react";
import { api, errText } from "../lib/api";
import { loadChains } from "../lib/chains";
import { usd, num, ago } from "../lib/format";
import type { BalanceResult, Chain, ChainStatus, PriceResult } from "../lib/types";
import { Btn, PageHeader, Panel, Empty } from "../components/ui";
import { agentProps, useAgentCommands } from "../takeover/registry";
import { CHAIN_BRAND, TESTNET_OF } from "../lib/brand-chains";

/** Chain mark from /brand/chains (testnets reuse their mainnet's), falling back to the accent tile + symbol. */
export function ChainDot({ c }: { c: Chain }) {
  const file = CHAIN_BRAND[c.id] ?? CHAIN_BRAND[TESTNET_OF[c.id] ?? ""];
  if (!file) return <span className="chain-dot" style={{ background: c.accent }}>{c.native.symbol.slice(0, 3)}</span>;
  return <span className={`chain-dot mark ${c.testnet ? "testnet" : ""}`} title={c.name}><img src={`/brand/chains/${file}`} alt="" loading="lazy" draggable={false} /></span>;
}

export function PriceForm({ chain }: { chain: Chain }) {
  const [q, setQ] = useState(chain.native.symbol);
  const [r, setR] = useState<PriceResult | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setQ(chain.native.symbol); setR(null); setErr(""); }, [chain.id, chain.native.symbol]);
  async function go() {
    setBusy(true); setErr("");
    const key = /^0x[0-9a-fA-F]{40}$/.test(q) || q.length > 30 ? `token=${encodeURIComponent(q)}` : `symbol=${encodeURIComponent(q)}`;
    try { setR(await api<PriceResult>(`/api/price?${key}&chain=${chain.id}`)); } catch (e) { setErr(errText(e)); setR(null); }
    setBusy(false);
  }
  return (
    <div className="col">
      <div className="row">
        <input className="input mono" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="Symbol or token address" {...agentProps("chains.priceInput", "Price symbol or token", "input")} />
        <Btn onClick={go} disabled={busy} agent="chains.priceGo" label="Get price">{busy ? "…" : "Price"}</Btn>
      </div>
      {r && <div className="stat"><span className="l">{r.symbol} · {r.source}</span><span className="v">{usd(r.usd)}</span><span className="tiny dim">{ago(r.updatedAt)}</span></div>}
      {err && <div className="small" style={{ color: "var(--bad)" }}>{err}</div>}
    </div>
  );
}

export function BalanceForm({ chain }: { chain: Chain }) {
  const [addr, setAddr] = useState("");
  const [r, setR] = useState<BalanceResult | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!addr.trim()) return;
    setBusy(true); setErr("");
    try { setR(await api<BalanceResult>(`/api/balance?address=${encodeURIComponent(addr.trim())}&chain=${chain.id}`, { timeoutMs: 40000 })); } catch (e) { setErr(errText(e)); setR(null); }
    setBusy(false);
  }
  return (
    <div className="col">
      <div className="row">
        <input className="input mono" value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder={chain.family === "evm" ? "0x… or name.eth" : `${chain.name} address`} {...agentProps("chains.balanceInput", "Address", "input")} />
        <Btn onClick={go} disabled={busy} agent="chains.balanceGo" label="Get balance">{busy ? "…" : "Balance"}</Btn>
      </div>
      {err && <div className="small" style={{ color: "var(--bad)" }}>{err}</div>}
      {r && (
        <table className="t">
          <thead><tr><th>Asset</th><th style={{ textAlign: "right" }}>Amount</th><th style={{ textAlign: "right" }}>USD</th></tr></thead>
          <tbody>
            <tr><td><b>{r.native.symbol}</b></td><td className="mono" style={{ textAlign: "right" }}>{num(r.native.amount, 6)}</td><td style={{ textAlign: "right" }}>{usd(r.native.usd)}</td></tr>
            {r.tokens.map((t) => <tr key={t.address}><td title={t.address}>{t.symbol}</td><td className="mono" style={{ textAlign: "right" }}>{num(t.amount, 6)}</td><td style={{ textAlign: "right" }}>{usd(t.usd)}</td></tr>)}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function Chains() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [live, setLive] = useState(false);
  const [testnets, setTestnets] = useState(false);
  const [family, setFamily] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string>("base");
  const [status, setStatus] = useState<ChainStatus | null>(null);
  const [statusErr, setStatusErr] = useState("");

  useEffect(() => { loadChains(testnets).then((r) => { setChains(r.chains); setLive(r.live); }); }, [testnets]);
  const chain = chains.find((c) => c.id === sel) ?? chains[0];
  useEffect(() => {
    if (!chain || !live) return;
    setStatus(null); setStatusErr("");
    api<ChainStatus>(`/api/chains/${chain.id}/status`).then(setStatus).catch((e) => setStatusErr(errText(e)));
  }, [chain?.id, live]);

  const families = useMemo(() => ["all", ...new Set(chains.map((c) => c.family))], [chains]);
  const shown = chains.filter((c) => (family === "all" || c.family === family) && (!q || `${c.name} ${c.id} ${c.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase())));

  useAgentCommands([
    { name: "chains.select", description: "Select a chain by id to show its status, price and balance tools.", params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, panel: "chains.grid", run: ({ id }) => { setSel(String(id)); return { ok: true }; } },
  ], () => `Chains page: ${chains.length} chains (${live ? "live" : "bundled registry"}), selected ${chain?.name ?? "none"}${status ? `, block ${status.blockNumber}, ${status.latencyMs} ms via ${status.rpcSource}` : ""}.`);

  return (
    <div className="page">
      <PageHeader title="Chains" sub={`${chains.length} networks · ${live ? "live from the Lumen server" : "offline — showing the bundled registry"}`}>
        <input className="input" style={{ width: 200 }} placeholder="Search chains" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="row small muted"><input type="checkbox" checked={testnets} onChange={(e) => setTestnets(e.target.checked)} /> testnets</label>
      </PageHeader>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        {families.map((f) => <button key={f} className={`chip ${family === f ? "on" : ""}`} onClick={() => setFamily(f)}>{f}</button>)}
      </div>
      <div className="split">
        <div className="chain-grid" {...agentProps("chains.grid", "Chain grid", "list")}>
          {shown.map((c) => (
            <button key={c.id} className={`chain-chip ${chain?.id === c.id ? "on" : ""}`} onClick={() => setSel(c.id)} {...agentProps(`chain.${c.id}`, c.name, "button")}>
              <ChainDot c={c} />
              <div style={{ minWidth: 0 }}>
                <div className="nm">{c.name}</div>
                <div className="meta">{c.family}{c.chainId ? ` · ${c.chainId}` : ""}{c.rpcSource ? ` · ${c.rpcSource}` : ""}{c.testnet ? " · testnet" : ""}</div>
              </div>
            </button>
          ))}
          {!shown.length && <Empty title="No chains match" />}
        </div>
        {chain && (
          <div className="col" style={{ gap: 12 }}>
            <Panel title={<div className="row"><ChainDot c={chain} /><h3>{chain.name}</h3></div>} actions={<a className="small" href={chain.explorer} target="_blank" rel="noreferrer">Explorer ↗</a>}>
              <div className="kv">
                <span>Family</span><span>{chain.family}</span>
                {chain.chainId ? <><span>Chain ID</span><span className="mono">{chain.chainId}</span></> : null}
                <span>Native</span><span>{chain.native.symbol} ({chain.native.decimals} dp)</span>
                <span>RPC</span><span>{chain.rpcSource ?? (chain.alchemy ? "alchemy or public" : "public")}</span>
                <span>Chainlink</span><span>{chain.chainlink ? "feeds available" : "—"}</span>
                <span>Tags</span><span>{chain.tags.join(", ") || "—"}</span>
              </div>
              <div className="sep" />
              {live ? status ? (
                <div className="stats">
                  <div className="stat"><span className="l">Block</span><span className="v mono">{num(status.blockNumber, 0)}</span></div>
                  {status.gasPriceGwei != null && <div className="stat"><span className="l">Gas</span><span className="v mono">{status.gasPriceGwei.toFixed(3)}<span className="small muted"> gwei</span></span></div>}
                  <div className="stat"><span className="l">Latency</span><span className="v mono">{status.latencyMs}<span className="small muted"> ms</span></span></div>
                </div>
              ) : statusErr ? <div className="small" style={{ color: "var(--bad)" }}>{statusErr}</div> : <div className="row small muted"><span className="spinner" /> Checking RPC…</div>
                : <div className="small muted">Live status needs the Lumen server.</div>}
            </Panel>
            <Panel title="Price"><PriceForm chain={chain} /></Panel>
            <Panel title="Balance"><BalanceForm chain={chain} /></Panel>
          </div>
        )}
      </div>
    </div>
  );
}
