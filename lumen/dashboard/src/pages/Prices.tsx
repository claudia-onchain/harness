// Prices: quick multi-symbol board + per-chain lookup. Source is shown for every quote (Chainlink first).
import { useEffect, useState } from "react";
import { api, errText } from "../lib/api";
import { loadChains } from "../lib/chains";
import { ago, usd } from "../lib/format";
import type { Chain, PriceResult } from "../lib/types";
import { Btn, PageHeader, Panel } from "../components/ui";
import { PriceForm } from "./Chains";

const BOARD: [string, string][] = [["ETH", "ethereum"], ["BTC", "bitcoin"], ["SOL", "solana"], ["BNB", "bnb"], ["POL", "polygon"], ["AVAX", "avalanche"], ["HYPE", "hyperevm"], ["LINK", "ethereum"]];

export default function Prices() {
  const [board, setBoard] = useState<Record<string, PriceResult | string>>({});
  const [chains, setChains] = useState<Chain[]>([]);
  const [sel, setSel] = useState("base");
  useEffect(() => { loadChains().then((r) => setChains(r.chains)); refresh(); }, []);
  function refresh() {
    for (const [sym, chain] of BOARD) {
      setBoard((b) => ({ ...b, [sym]: "…" }));
      api<PriceResult>(`/api/price?symbol=${sym}&chain=${chain}`).then((r) => setBoard((b) => ({ ...b, [sym]: r }))).catch((e) => setBoard((b) => ({ ...b, [sym]: errText(e) })));
    }
  }
  const chain = chains.find((c) => c.id === sel);
  return (
    <div className="page">
      <PageHeader title="Prices" sub="Chainlink feeds first where they exist, then DefiLlama, CoinGecko or Alchemy. The source is always shown."><Btn icon="update" onClick={refresh}>Refresh</Btn></PageHeader>
      <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
        {BOARD.map(([sym]) => {
          const r = board[sym];
          return (
            <div key={sym} className="stat">
              <span className="l">{sym}</span>
              {typeof r === "object" ? <><span className="v">{usd(r.usd)}</span><span className="tiny dim">{r.source} · {ago(r.updatedAt)}</span></> : <span className="small muted" title={r}>{r === "…" ? "…" : "unavailable"}</span>}
            </div>
          );
        })}
      </div>
      <div className="section-t">Lookup</div>
      <Panel title={<div className="row"><h3>Chain</h3><select className="select" style={{ width: 220, height: 30 }} value={sel} onChange={(e) => setSel(e.target.value)}>{chains.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}>
        {chain && <PriceForm chain={chain} />}
      </Panel>
    </div>
  );
}
