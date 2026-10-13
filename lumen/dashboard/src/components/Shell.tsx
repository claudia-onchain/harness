// App shell: sidebar, top bar (model/persona switcher, activity orb), update banner, activity drawer, mobile tab bar.
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Icon, LumenMark } from "./icons";
import { NAV, routeForTool, titleFor } from "./nav";
import { useAgent } from "../state/agent";
import { useApp } from "../state/app";
import { bus } from "../lib/api";
import { agentProps } from "../takeover/registry";
import { TopBar } from "./TopBar";
import { ActivityDrawer } from "./ActivityDrawer";
import { UpdateBanner } from "./UpdateBanner";

function usePulseRoute() {
  const [route, setRoute] = useState<string>();
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; state: string };
      const r = routeForTool(d?.name);
      if (!r) return;
      setRoute(r);
      clearTimeout(t);
      t = setTimeout(() => setRoute(undefined), d.state === "running" ? 6000 : 1500);
    };
    bus.addEventListener("tool", on);
    return () => { bus.removeEventListener("tool", on); clearTimeout(t); };
  }, []);
  return route;
}

function Sidebar() {
  const a = useAgent();
  const { state, mode } = useApp();
  const pulse = usePulseRoute();
  return (
    <aside className="side">
      <div className="brand">
        <LumenMark />
        <span className="brand-name">LUMEN</span>
        <span className="brand-ver">{state?.version ? `v${state.version}` : ""}</span>
      </div>
      <nav className="nav">
        {NAV.map((g) => (
          <div className="nav-group" key={g.group}>
            <div className="nav-group-t">{g.group}</div>
            {g.items.map((it) => (
              <NavLink key={it.route} to={it.route} className={({ isActive }) => `nav-item ${isActive ? "active" : ""} ${pulse === it.route ? "pulse" : ""}`} {...agentProps(`nav:${it.route}`, it.label, "tab")}>
                <Icon name={it.icon} />
                <span>{it.label}</span>
                {it.route === "/approvals" && a.approvals.length > 0 && <span className="count">{a.approvals.length}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="side-foot">
        <span className={`dot ${a.conn === "open" ? "ok" : mode === "offline" ? "warn" : ""}`} />
        <span>{a.conn === "open" ? "Connected" : mode === "offline" ? "Demo mode · server offline" : a.conn === "connecting" ? "Connecting…" : a.retryIn ? `Reconnecting in ${a.retryIn}s` : "Disconnected"}</span>
      </div>
    </aside>
  );
}

const TABS = [
  { route: "/chat", label: "Chat", icon: "chat" },
  { route: "/studio/photo", label: "Photo", icon: "photo" },
  { route: "/studio/video", label: "Video", icon: "video" },
  { route: "/studio/music", label: "Music", icon: "music" },
];

function TabBar() {
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useEffect(() => setMore(false), [loc.pathname]);
  return (
    <>
      {more && (
        <div className="more-sheet">
          {NAV.map((g) => (
            <div key={g.group} className="nav-group" style={{ marginTop: 6 }}>
              <div className="nav-group-t">{g.group}</div>
              {g.items.map((it) => (
                <NavLink key={it.route} to={it.route} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Icon name={it.icon} /><span>{it.label}</span></NavLink>
              ))}
            </div>
          ))}
        </div>
      )}
      <nav className="tabbar">
        {TABS.map((t) => (
          <NavLink key={t.route} to={t.route} className={({ isActive }) => (isActive ? "active" : "")}><Icon name={t.icon} /><span>{t.label}</span></NavLink>
        ))}
        <button className={more ? "active" : ""} onClick={() => setMore((m) => !m)}><Icon name="more" /><span>More</span></button>
      </nav>
    </>
  );
}

/** Compact live ticker of the newest agent activity while the drawer is closed. */
function Ticker({ onOpen }: { onOpen: () => void }) {
  const a = useAgent();
  const last = a.activity[0];
  if (a.status.state === "idle" || !last || Date.now() - last.ts > 20000) return null;
  return (
    <button className="ticker" onClick={onOpen} title="Open agent activity">
      {last.state === "running" ? <span className="spinner" /> : <span className={`dot ${last.state === "ok" ? "ok" : "bad"}`} />}
      <span className="mono">{last.name}</span>
      <span className="muted">{last.summary || last.label}</span>
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const [drawer, setDrawer] = useState(false);
  const { mode } = useApp();
  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <TopBar title={titleFor(loc.pathname)} onActivity={() => setDrawer((d) => !d)} />
        {mode === "offline" && (
          <div className="banner warn">
            <Icon name="bolt" />
            <span className="grow">Lumen server not reachable — studios work locally, agent features are paused. Run <code>lumen dashboard</code>.</span>
          </div>
        )}
        <UpdateBanner />
        <main className="content" id="content">{children}</main>
      </div>
      <ActivityDrawer open={drawer} onClose={() => setDrawer(false)} />
      {!drawer && <Ticker onOpen={() => setDrawer(true)} />}
      <TabBar />
    </div>
  );
}
