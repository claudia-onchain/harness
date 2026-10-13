import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { pluginRegistry } from "../plugins/host";
import { Empty, PageHeader } from "../components/ui";

export default function PluginPanel() {
  const { id } = useParams();
  const reg = pluginRegistry.use();
  const panel = reg.panels.find((p) => p.id === id);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!panel || !host.current) return;
    const cleanup = panel.render(host.current);
    return () => { if (typeof cleanup === "function") cleanup(); if (host.current) host.current.innerHTML = ""; };
  }, [panel]);
  if (!panel) return <div className="page"><Empty icon="plug" title="Panel not loaded">Enable its plugin on the Plugins page.</Empty></div>;
  return <div className="page"><PageHeader title={panel.title} sub={`from plugin ${panel.pluginId}`} /><div ref={host} className="panel" style={{ padding: 14, minHeight: 300 }} /></div>;
}
