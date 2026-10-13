// Skills browser: search, filter by category / source / chain, rendered markdown view.
import { useEffect, useMemo, useState } from "react";
import { api, errText } from "../lib/api";
import type { SkillInfo } from "../lib/types";
import { Empty, PageHeader, Panel } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { useApp } from "../state/app";
import { agentProps, useAgentCommands } from "../takeover/registry";

const CATS = ["all", "crypto-core", "build", "create", "lumen", "chain"];

export default function Skills() {
  const { mode } = useApp();
  const [all, setAll] = useState<SkillInfo[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [source, setSource] = useState("all");
  const [chain, setChain] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [md, setMd] = useState<string>("");

  useEffect(() => { api<SkillInfo[]>("/api/skills").then(setAll).catch((e) => { setErr(errText(e)); setAll([]); }); }, [mode]);
  useEffect(() => {
    if (!sel) return;
    setMd("");
    api<{ markdown: string }>(`/api/skills/${encodeURIComponent(sel)}`).then((r) => setMd(r.markdown.replace(/^---[\s\S]*?\n---\n/, ""))).catch((e) => setMd(`Could not load: ${errText(e)}`));
  }, [sel]);

  const chains = useMemo(() => [...new Set((all ?? []).map((s) => s.chain).filter(Boolean) as string[])].sort(), [all]);
  const list = useMemo(() => {
    const t = q.toLowerCase().trim();
    return (all ?? []).filter((s) => (cat === "all" || s.category === cat) && (source === "all" || s.source === source) && (!chain || s.chain === chain)
      && (!t || `${s.name} ${s.title} ${s.description}`.toLowerCase().includes(t))).slice(0, 400);
  }, [all, q, cat, source, chain]);

  useAgentCommands([
    { name: "skills.open", description: "Open a skill by slug in the skills browser.", params: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] }, panel: "skills.list", run: ({ slug }) => { setSel(String(slug)); return { ok: true }; } },
    { name: "skills.search", description: "Filter the skills list.", params: { type: "object", properties: { q: { type: "string" } }, required: ["q"] }, panel: "skills.list", run: ({ q: s }) => { setQ(String(s)); return { ok: true }; } },
  ], () => `Skills browser: ${all?.length ?? 0} skills, filter "${q}" category ${cat}, showing ${list.length}${sel ? `, open: ${sel}` : ""}.`);

  return (
    <div className="page">
      <PageHeader title="Skills" sub={all ? `${all.length} skills — 100+ base, 20 templates rendered for every chain, plus your own (~/.lumen/skills, ~/.agents/skills, ~/.claude/skills)` : "Loading…"} />
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search skills…" value={q} onChange={(e) => setQ(e.target.value)} {...agentProps("skills.search", "Search skills", "input")} />
        <div className="tabs">{CATS.map((c) => <button key={c} className={`tab ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}</div>
        <select className="select" style={{ width: 120 }} value={source} onChange={(e) => setSource(e.target.value)}><option value="all">all sources</option><option value="base">base</option><option value="chain">chain</option><option value="user">user</option></select>
        <select className="select" style={{ width: 150 }} value={chain} onChange={(e) => setChain(e.target.value)}><option value="">any chain</option>{chains.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      {err && mode !== "online" ? <Empty icon="skills" title="Skills need the Lumen server">Run <code>lumen dashboard</code>, or browse them in the terminal with <code>lumen skills</code>.</Empty> : (
        <div className="split" style={{ gridTemplateColumns: "minmax(0, 380px) 1fr" }}>
          <div className="skill-list" {...agentProps("skills.list", "Skills list", "list")}>
            {list.map((s) => (
              <button key={s.slug} className={`skill-i ${sel === s.slug ? "on" : ""}`} onClick={() => setSel(s.slug)}>
                <div className="row"><b className="grow" style={{ fontSize: 13 }}>{s.title || s.name}</b><span className="badge">{s.chain ?? s.category}</span></div>
                <span className="d">{s.description}</span>
              </button>
            ))}
            {all && !list.length && <Empty title="No skills match" />}
          </div>
          <Panel className="skill-view" title={sel ?? "Select a skill"}>
            {sel ? md ? <Markdown text={md} /> : <div className="row muted"><span className="spinner" /> Loading…</div> : <div className="muted small">Pick a skill to read it. The agent loads skills on demand with <code>skill_load</code>; in the terminal use <code>/skill:&lt;name&gt;</code>.</div>}
          </Panel>
        </div>
      )}
    </div>
  );
}
