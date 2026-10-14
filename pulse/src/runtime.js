// Wires the pieces into one object the CLI and channels share. Routine runners and the Grok client are
// registered here by the lead (see TODO); everything below works offline without src/grok present.
import { getConfig, getKeys, ensureHome, P } from "./core/config.js";
import { openStore } from "./core/store.js";
import { createBudget } from "./core/budget.js";
import { createScheduler } from "./core/routines.js";
import { createApprovals } from "./core/approvals.js";
import { createLogger } from "./core/log.js";
import { createTelegram } from "./channels/telegram.js";
import { createHttp } from "./channels/http.js";
import { VERSION } from "./version.js";
import { wire } from "./wire.js";

export async function createRuntime({ console: toConsole = false, telegram: wantTelegram = true, http: wantHttp = true, grok: wantGrok = true, dbPath } = {}) {
  ensureHome();
  const config = getConfig();
  const keys = getKeys();
  const log = createLogger({ console: toConsole });
  const store = openStore(dbPath || P.db);
  const budget = createBudget({ store, caps: config.caps });
  const runners = {};
  const scheduler = createScheduler({ store, runners, log, onError: (e, { routine }) => log.error("routine.error", { routine: routine.id, error: e.message }) });

  let grok = null;
  if (wantGrok && keys.has("xai")) {
    try {
      // Dynamic import so the core works (and tests run) before src/grok lands.
      const mod = await import("./grok/responses.js");
      // createGrok({ apiKey, fetch, safetyIdentifier, onUsage, ... }); routines set safety_identifier per call.
      // XAI_BASE_URL points at test/mock-grok.js for offline runs.
      grok = mod.createGrok?.({ apiKey: keys.get("xai"), baseUrl: process.env.XAI_BASE_URL || undefined }) ?? null;
    } catch (e) {
      if (e?.code !== "ERR_MODULE_NOT_FOUND") throw e;
      log.warn("grok.client.missing", { error: e.message });
    }
  }

  const telegramToken = wantTelegram ? keys.get("telegram") : null;
  let telegram = null;
  const approvals = createApprovals({
    store, log,
    onRequest: async (a) => {
      if (!telegram || !config.telegram.chatId) return;
      const title = a.kind === "post" ? "Post to X?" : a.kind === "spend" ? "Exceed cap?" : `Approve ${a.kind}?`;
      const detail = a.payload?.summary || a.payload?.text || (a.payload ? JSON.stringify(a.payload).slice(0, 800) : "");
      await telegram.sendMessage(config.telegram.chatId, `<b>${telegram.escapeHtml(title)}</b>\n${telegram.escapeHtml(detail)}\n<code>${a.id}</code>`, {
        buttons: [[{ text: "Approve", data: `ap:${a.id}:approve` }, { text: "Deny", data: `ap:${a.id}:deny` }]],
      });
    },
  });

  const rt = { config, keys, log, store, budget, scheduler, approvals, runners, grok, telegram: null, http: null, version: VERSION };

  if (telegramToken) {
    telegram = createTelegram({
      token: telegramToken, log,
      allowChats: config.telegram.chatId ? [config.telegram.chatId] : null,
      onMessage: (m) => rt.handlers?.onMessage?.(m, rt),
      onCallback: async (cb) => {
        const m = /^ap:([^:]+):(approve|deny)$/.exec(cb.data || "");
        if (m) {
          const row = approvals.decide(m[1], m[2], cb.from?.username || String(cb.from?.id || ""));
          await telegram.answerCallback(cb.id, row ? `${row.status}` : "already decided");
          if (cb.messageId) await telegram.editButtons(cb.chatId, cb.messageId, []).catch(() => {});
          return;
        }
        return rt.handlers?.onCallback?.(cb, rt);
      },
    });
    rt.telegram = telegram;
  }

  if (wantHttp) rt.http = createHttp({ store, scheduler, token: keys.get("http"), port: config.http.port, log, version: VERSION });

  rt.print = toConsole ? (s) => process.stdout.write(s + "\n") : null;
  wire(rt); // runners, rt.ask, rt.imagine, Telegram command handlers (src/wire.js)

  rt.close = async () => {
    await scheduler.stop();
    approvals.stop();
    if (rt.telegram) await rt.telegram.stop();
    if (rt.http) await rt.http.stop();
    store.close();
  };
  return rt;
}
