import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Boot, Locked } from "./components/Boot";
import { Shell } from "./components/Shell";
import { Toasts } from "./components/Toasts";
import { AgentCursor } from "./takeover/AgentCursor";
import { handleServerOp, setNavigator } from "./takeover/runner";
import { sendHello, setRoute } from "./takeover/registry";
import { runDemoTakeover } from "./takeover/demo";
import { agent, connect } from "./state/agent";
import { app, refreshState, useApp } from "./state/app";
import { bus } from "./lib/api";
import { loadPlugins } from "./plugins/host";
import Chat from "./pages/Chat";

const Approvals = lazy(() => import("./pages/Approvals"));
const Sessions = lazy(() => import("./pages/Sessions"));
const Keys = lazy(() => import("./pages/Keys"));
const Chains = lazy(() => import("./pages/Chains"));
const Wallet = lazy(() => import("./pages/Wallet"));
const Prices = lazy(() => import("./pages/Prices"));
const Skills = lazy(() => import("./pages/Skills"));
const Plugins = lazy(() => import("./pages/Plugins"));
const Personas = lazy(() => import("./pages/Personas"));
const Updates = lazy(() => import("./pages/Updates"));
const Settings = lazy(() => import("./pages/Settings"));
const Library = lazy(() => import("./pages/Library"));
const PluginPanel = lazy(() => import("./pages/PluginPanel"));
const ImageStudio = lazy(() => import("./studios/image/ImageStudio"));
const PhotoStudio = lazy(() => import("./studios/photo/PhotoStudio"));
const VideoStudio = lazy(() => import("./studios/video/VideoStudio"));
const MusicStudio = lazy(() => import("./studios/music/MusicStudio"));
const AudioStudio = lazy(() => import("./studios/audio/AudioStudio"));

/** Keeps the takeover registry in sync with the router and lets the runner navigate. */
function RouteBridge() {
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => { setNavigator((r) => nav(r)); }, [nav]);
  useEffect(() => { setRoute(loc.pathname); }, [loc.pathname]);
  return null;
}

function Loading() {
  return <div className="page"><div className="row muted"><span className="spinner" /> Loading…</div></div>;
}

export default function App() {
  const { mode } = useApp();
  const [booted, setBooted] = useState(() => { try { return sessionStorage.getItem("lumen.booted") === "1"; } catch { return false; } });

  useEffect(() => {
    refreshState();
    connect();
    agent.onUi(handleServerOp);
    const off = agent.onOpen(() => { sendHello(); if (app.get().mode !== "online") refreshState(); });
    const onState = () => refreshState();
    bus.addEventListener("state", onState);
    const t = setInterval(() => { if (app.get().mode === "offline") refreshState(); }, 15000);
    return () => { off(); bus.removeEventListener("state", onState); clearInterval(t); };
  }, []);

  useEffect(() => { if (mode === "online") loadPlugins(); }, [mode]);

  const finishBoot = () => {
    setBooted(true);
    try { sessionStorage.setItem("lumen.booted", "1"); } catch { /* */ }
    if (new URLSearchParams(location.search).get("demo") === "takeover") setTimeout(runDemoTakeover, 500);
  };
  useEffect(() => {
    if (booted && new URLSearchParams(location.search).get("demo") === "takeover") setTimeout(runDemoTakeover, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mode === "unauthorized") return <Locked />;

  return (
    <BrowserRouter>
      <RouteBridge />
      <Shell>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/studio/image" element={<ImageStudio />} />
            <Route path="/studio/photo" element={<PhotoStudio />} />
            <Route path="/studio/video" element={<VideoStudio />} />
            <Route path="/studio/music" element={<MusicStudio />} />
            <Route path="/studio/audio" element={<AudioStudio />} />
            <Route path="/library" element={<Library />} />
            <Route path="/chains" element={<Chains />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/prices" element={<Prices />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/plugins" element={<Plugins />} />
            <Route path="/plugin/:id" element={<PluginPanel />} />
            <Route path="/personas" element={<Personas />} />
            <Route path="/keys" element={<Keys />} />
            <Route path="/updates" element={<Updates />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </Suspense>
      </Shell>
      <AgentCursor />
      <Toasts />
      {!booted && <Boot onDone={finishBoot} />}
    </BrowserRouter>
  );
}
