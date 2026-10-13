// First-run setup inside the TUI: pick a provider, paste a key (masked), live-test it, pick a model and persona.
import { LLM } from "../llm/catalog.js";
import { testLlm, listModels, detectLocal } from "../llm/index.js";
import { listPersonas } from "../core/personas.js";
import { P } from "../core/paths.js";

const CHOICES = [
  { label: "Anthropic", detail: "Claude Opus 5.5 · console.anthropic.com", value: "anthropic" },
  { label: "OpenAI", detail: "GPT-6 · platform.openai.com", value: "openai" },
  { label: "xAI / Grok", detail: "Grok 4.7 · console.x.ai", value: "xai" },
  { label: "OpenRouter", detail: "one key for every model + media · openrouter.ai", value: "openrouter" },
  { label: "Google Gemini", detail: "Gemini 3.8 Flash · aistudio.google.com", value: "gemini" },
  { label: "Ollama (local)", detail: "models on this computer, no key", value: "ollama" },
  { label: "Demo mode", detail: "offline mock model, to look around", value: "mock" },
  { label: "Skip for now", detail: "add a key later with lumen keys set", value: "skip" },
];

export async function firstRunSetup(app) {
  const { rt, th } = app;
  app.print([
    th.bold(th.gradient("Welcome to Lumen")),
    th.text("Lumen runs on your own keys. Add one LLM key to start; crypto and media features unlock as you add more."),
    th.muted(`Keys are stored in ${P.keys} (mode 0600). Env vars like ANTHROPIC_API_KEY also work.`),
  ]);
  const choice = await app.pick({ title: "Pick a model provider", items: CHOICES });
  if (!choice || choice.value === "skip") return app.note("No problem. Add a key any time: lumen keys set anthropic <key>, then /reload.", "warn");
  const provider = choice.value;
  if (provider === "mock") { rt.setModel("mock:echo", { persist: false }); return app.note('Demo mode: replies are echoed. Try "demo" or "call get_price {"symbol":"ETH"}".', "ok"); }
  if (provider === "ollama") {
    app.setActivity("looking for Ollama");
    rt.localUp = await detectLocal();
    app.setActivity(null);
    if (!rt.localUp.ollama) return app.note("Ollama isn't running. Install it from ollama.com, run `ollama serve` and `ollama pull <model>`, then /reload.", "warn");
  } else {
    const p = LLM[provider];
    for (let attempt = 0; attempt < 3; attempt++) {
      const key = await app.ask({ title: `Paste your ${p.name} API key`, mask: true, hint: `Get one at ${p.docs} · Esc to cancel` });
      if (!key) return app.note("Setup cancelled. Run Lumen again or use lumen keys set.", "warn");
      rt.keys.set(p.key, key);
      app.setActivity(`testing ${p.name} key`);
      const r = await testLlm(provider, rt.keys);
      app.setActivity(null);
      if (r.ok) { app.note(`${p.name}: ${r.message}`, "ok"); break; }
      app.note(`${p.name}: ${r.message}`, "warn");
      const next = await app.pick({ title: "That key didn't work", items: [{ label: "Try another key", value: "retry" }, { label: "Keep it anyway", value: "keep" }, { label: "Cancel", value: "cancel" }] });
      if (!next || next.value === "cancel") { rt.keys.unset(p.key); return app.note("Removed the key. Add one later with lumen keys set.", "warn"); }
      if (next.value === "keep") break;
    }
  }
  app.setActivity("loading models");
  const models = await listModels(provider, rt.keys);
  app.setActivity(null);
  const def = LLM[provider].roles.default;
  const items = models.slice(0, 200).map((m) => ({ label: m.id, detail: [m.name !== m.id ? m.name : "", m.context ? `${Math.round(m.context / 1000)}k ctx` : "", m.id === def ? "recommended" : ""].filter(Boolean).join(" · "), value: m.id }));
  let id = def;
  if (items.length) {
    const pick = await app.pick({ title: "Default model", items, index: Math.max(0, items.findIndex((x) => x.value === def)) });
    if (pick) id = pick.value;
  }
  if (!id) return app.note("No model picked. Use /model later.", "warn");
  rt.setModel({ provider, id });
  const personas = listPersonas();
  const pp = await app.pick({ title: "Persona (who Lumen is)", items: personas.map((p) => ({ label: p.name, detail: p.summary.slice(0, 80), value: p.id })), index: Math.max(0, personas.findIndex((p) => p.id === "lumen")) });
  if (pp) rt.setPersona(pp.value);
  app.note(`All set: ${provider}:${id} as ${rt.persona.name}. Ask anything, or try "price of ETH on base".`, "ok");
}
