// Small UI primitives shared by every page and studio.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { agentProps } from "../takeover/registry";
import { clamp } from "../lib/store";
import { Icon } from "./icons";
import type { UiRole } from "../lib/types";

export function Panel({ title, actions, children, className = "", bodyClass = "panel-b", agentId, agentLabel }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; agentId?: string; agentLabel?: string }) {
  return (
    <section className={`panel ${className}`} {...(agentId ? agentProps(agentId, agentLabel, "panel") : {})}>
      {(title || actions) && (
        <div className="panel-h">
          {typeof title === "string" ? <h3>{title}</h3> : title}
          <div className="grow" />
          {actions}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-h">
      <div className="grow">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ icon = "bolt", title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big"><Icon name={icon} size={28} /></div>
      <div style={{ color: "var(--text)", fontWeight: 500 }}>{title}</div>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function Btn({ icon, children, kind, size, on, agent, label, role, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: string; kind?: "primary" | "ghost" | "danger" | "ok"; size?: "sm"; on?: boolean; agent?: string; label?: string; role?: UiRole }) {
  const cls = ["btn", kind, size, on ? "on" : "", !children && icon ? "icon" : "", rest.className].filter(Boolean).join(" ");
  return (
    <button type="button" {...rest} className={cls} {...(agent ? agentProps(agent, label ?? (typeof children === "string" ? children : rest.title), role ?? "button") : {})}>
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
    </button>
  );
}

/** Rotary knob: drag vertically (or wheel); double-click resets. Agent-settable via `agent-set` events. */
export function Knob({ label, value, min, max, step = 0.01, onChange, format, agent, def, size = 46 }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; agent?: string; def?: number; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = (value - min) / (max - min || 1);
  const angle = -135 + t * 270;
  const snap = useCallback((v: number) => clamp(Math.round(v / step) * step, min, max), [min, max, step]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onSet = (e: Event) => onChange(snap(Number((e as CustomEvent).detail?.value)));
    el.addEventListener("agent-set", onSet);
    return () => el.removeEventListener("agent-set", onSet);
  }, [onChange, snap]);
  const onPointerDown = (e: React.PointerEvent) => {
    const y0 = e.clientY;
    const v0 = value;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent) => onChange(snap(v0 + ((y0 - ev.clientY) / 160) * (max - min)));
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };
  const r = size / 2 - 5;
  const arc = (a0: number, a1: number) => {
    const p = (a: number) => [size / 2 + r * Math.cos(((a - 90) * Math.PI) / 180), size / 2 + r * Math.sin(((a - 90) * Math.PI) / 180)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  return (
    <div className="knob" ref={ref} {...(agent ? agentProps(agent, label, "knob") : {})} data-agent-value={String(value)}>
      <svg width={size} height={size} onPointerDown={onPointerDown} onDoubleClick={() => def !== undefined && onChange(def)}
        onWheel={(e) => onChange(snap(value - Math.sign(e.deltaY) * (max - min) / 50))} style={{ cursor: "ns-resize", touchAction: "none" }}>
        <path d={arc(-135, 135)} stroke="#232840" strokeWidth="4" fill="none" strokeLinecap="round" />
        {t > 0.003 && <path d={arc(-135, angle)} stroke="url(#knobg)" strokeWidth="4" fill="none" strokeLinecap="round" />}
        <defs><linearGradient id="knobg"><stop offset="0" stopColor="#7c5cff" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r - 7} fill="#141722" stroke="#262b3e" />
        <line x1={size / 2} y1={size / 2} x2={size / 2 + (r - 10) * Math.cos(((angle - 90) * Math.PI) / 180)} y2={size / 2 + (r - 10) * Math.sin(((angle - 90) * Math.PI) / 180)} stroke="#e8ecf4" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div className="knob-l">{label}</div>
      <div className="knob-v">{format ? format(value) : value.toFixed(2)}</div>
    </div>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, agent, format }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; agent?: string; format?: (v: number) => string }) {
  return (
    <label className="slider-row">
      <span className="sl-l">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} {...(agent ? agentProps(agent, label, "slider") : {})} />
      <span className="sl-v mono">{format ? format(value) : value}</span>
    </label>
  );
}

export function Tabs<T extends string>({ value, onChange, items, agentPrefix }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[]; agentPrefix?: string }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button key={it.id} role="tab" className={`tab ${value === it.id ? "on" : ""}`} onClick={() => onChange(it.id)} {...(agentPrefix ? agentProps(`${agentPrefix}.${it.id}`, typeof it.label === "string" ? it.label : it.id, "tab") : {})}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** File drop zone wrapper: calls onFiles with dropped/picked files. */
export function DropZone({ accept, onFiles, children, className = "", agentId, label }: { accept?: string; onFiles: (files: File[]) => void; children: ReactNode; className?: string; agentId?: string; label?: string }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`dropzone ${over ? "over" : ""} ${className}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setOver(false); onFiles([...e.dataTransfer.files]); } }}
      {...(agentId ? agentProps(agentId, label, "panel") : {})}
    >
      {children}
      <input ref={input} type="file" accept={accept} multiple hidden onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
      <button type="button" className="dz-pick" onClick={() => input.current?.click()} hidden />
    </div>
  );
}

export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const i = document.createElement("input");
    i.type = "file";
    i.accept = accept;
    i.multiple = multiple;
    i.onchange = () => resolve([...(i.files ?? [])]);
    i.click();
  });
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    fn().then((data) => setState({ data, loading: false }), (error) => setState({ error, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}
