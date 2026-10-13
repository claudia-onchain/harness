import { dismiss, toasts } from "../lib/toast";

export function Toasts() {
  const { list } = toasts.use();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.level}`}>
          <span className={`dot ${t.level === "ok" ? "ok" : t.level === "warn" ? "warn" : t.level === "bad" ? "bad" : ""}`} />
          <span className="grow">{t.text}</span>
          {t.action && <button className="btn sm" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}
