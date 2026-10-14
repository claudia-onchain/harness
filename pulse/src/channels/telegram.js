// Telegram Bot API over plain fetch: long polling (getUpdates with offset), HTML messages chunked at the
// 4096-char limit, photos/videos from a URL or a Buffer, inline buttons for approvals. Only chats listed in
// `allowChats` are answered (anyone who finds the bot could otherwise spend your Grok budget).
const MAX_TEXT = 4096;
const MAX_CAPTION = 1024;

export class TelegramError extends Error {
  constructor(method, code, description, extra = {}) {
    super(`telegram ${method}: ${code} ${description}`);
    this.name = "TelegramError";
    Object.assign(this, { method, code, description, ...extra });
  }
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Split at `max` chars, preferring paragraph/line breaks and never splitting inside an HTML tag or entity. */
export function chunk(text, max = MAX_TEXT) {
  const out = [];
  let rest = String(text ?? "");
  while (rest.length > max) {
    let cut = -1;
    for (const sep of ["\n\n", "\n", " "]) { const i = rest.lastIndexOf(sep, max); if (i > max / 2) { cut = i; break; } }
    if (cut < 0) cut = max;
    // Back off a cut landing inside <tag>, inside &entity;, or between an open tag and its close
    // (Telegram rejects a part with unbalanced entities).
    let head = rest.slice(0, cut);
    const lt = head.lastIndexOf("<"), gt = head.lastIndexOf(">");
    if (lt > gt) { cut = lt; head = rest.slice(0, cut); }
    const amp = head.lastIndexOf("&"), semi = head.lastIndexOf(";");
    if (amp > semi && cut - amp < 10) { cut = amp; head = rest.slice(0, cut); }
    const open = unclosedTagAt(head);
    if (open > 0) cut = open;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, "");
  }
  if (rest || !out.length) out.push(rest);
  return out;
}

/** Index of the earliest tag still open at the end of `s`, or -1 when every tag is closed. */
function unclosedTagAt(s) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name === m[2].toLowerCase()) { stack.splice(i); break; } }
    else stack.push({ name: m[2].toLowerCase(), at: m.index });
  }
  return stack.length ? stack[0].at : -1;
}

/** "/watch add x --every 15m" -> { command: "watch", args: [...] }; free text -> { command: null, args: [] }. */
export function parseCommand(text, botName = "") {
  const t = String(text ?? "").trim();
  const m = /^\/([a-zA-Z0-9_]+)(?:@([a-zA-Z0-9_]+))?(?:\s+([\s\S]*))?$/.exec(t);
  if (!m) return { command: null, args: [], text: t };
  if (m[2] && botName && m[2].toLowerCase() !== botName.toLowerCase()) return { command: null, args: [], text: t, foreign: true };
  const rest = (m[3] || "").trim();
  return { command: m[1].toLowerCase(), args: rest ? splitArgs(rest) : [], text: t, rest };
}

/** Shell-ish split that keeps "quoted strings" together. */
export function splitArgs(s) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

const keyboard = (buttons) => (buttons?.length ? { inline_keyboard: buttons.map((row) => row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: String(b.data ?? b.callback_data ?? "") }))) } : undefined);

export function createTelegram({ token, fetch: f = globalThis.fetch, onMessage, onCallback, log, apiBase = "https://api.telegram.org", pollTimeoutSec = 25, allowChats = null, botName = "", idleDelayMs = 0, backoffMs = 1000 } = {}) {
  if (!token) throw new Error("telegram token required");
  const lg = log || { info() {}, warn() {}, error() {}, debug() {} };
  const allowed = allowChats == null ? null : new Set([].concat(allowChats).filter((c) => c != null).map(String));
  let running = false, offset = 0, ctl = null, loop = null, me = null;

  async function api(method, body = {}, { signal, form } = {}) {
    const url = `${apiBase}/bot${token}/${method}`;
    const init = form ? { method: "POST", body: form, signal } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal };
    const res = await f(url, init);
    let data = null;
    try { data = await res.json(); } catch { data = { ok: false, description: `non-JSON reply (${res.status})` }; }
    if (!data.ok) {
      const retry = data.parameters?.retry_after;
      throw new TelegramError(method, data.error_code ?? res.status, data.description || "unknown error", { retryAfter: retry });
    }
    return data.result;
  }

  async function sendMessage(chatId, text, { parseMode = "HTML", buttons, disablePreview = true, replyTo } = {}) {
    const parts = chunk(text, MAX_TEXT);
    let last = null;
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      last = await api("sendMessage", {
        chat_id: chatId, text: parts[i], ...(parseMode ? { parse_mode: parseMode } : {}),
        link_preview_options: { is_disabled: !!disablePreview },
        ...(replyTo && i === 0 ? { reply_parameters: { message_id: replyTo } } : {}),
        ...(isLast && keyboard(buttons) ? { reply_markup: keyboard(buttons) } : {}),
      });
    }
    return last;
  }

  /** Photo/video from a URL (string) or Buffer. A caption over 1024 chars continues in a follow-up message. */
  async function sendMedia(kind, chatId, media, { caption = "", buttons, parseMode = "HTML", filename, duration, width, height } = {}) {
    const [head, ...tail] = caption ? chunk(caption, MAX_CAPTION) : [""];
    const field = kind === "photo" ? "photo" : "video";
    const method = kind === "photo" ? "sendPhoto" : "sendVideo";
    const common = { chat_id: chatId, ...(head ? { caption: head, parse_mode: parseMode } : {}), ...(!tail.length && keyboard(buttons) ? { reply_markup: keyboard(buttons) } : {}), ...(duration ? { duration } : {}), ...(width ? { width } : {}), ...(height ? { height } : {}) };
    let msg;
    if (Buffer.isBuffer(media) || media instanceof Uint8Array) {
      const form = new FormData();
      for (const [k, v] of Object.entries(common)) form.append(k, typeof v === "string" ? v : JSON.stringify(v));
      form.append(field, new Blob([media], { type: kind === "photo" ? "image/png" : "video/mp4" }), filename || (kind === "photo" ? "card.png" : "brief.mp4"));
      msg = await api(method, null, { form });
    } else {
      msg = await api(method, { ...common, [field]: String(media) });
    }
    for (let i = 0; i < tail.length; i++) msg = await sendMessage(chatId, tail[i], { parseMode, buttons: i === tail.length - 1 ? buttons : undefined });
    return msg;
  }

  const sendPhoto = (chatId, media, opts) => sendMedia("photo", chatId, media, opts);
  const sendVideo = (chatId, media, opts) => sendMedia("video", chatId, media, opts);
  const answerCallback = (id, text = "", { alert = false } = {}) => api("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}), show_alert: alert });
  const editButtons = (chatId, messageId, buttons) => api("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: keyboard(buttons) ?? { inline_keyboard: [] } });
  const editText = (chatId, messageId, text, { parseMode = "HTML", buttons } = {}) => api("editMessageText", { chat_id: chatId, message_id: messageId, text: chunk(text)[0], parse_mode: parseMode, ...(keyboard(buttons) ? { reply_markup: keyboard(buttons) } : {}) });
  const getMe = async () => (me ||= await api("getMe"));

  const chatOk = (chatId) => !allowed || allowed.has(String(chatId));

  async function handle(update) {
    offset = Math.max(offset, update.update_id + 1);
    const msg = update.message || update.edited_message;
    if (msg?.text != null) {
      const chatId = msg.chat.id;
      if (!chatOk(chatId)) { lg.warn("telegram.ignored", { chatId, from: msg.from?.username }); return; }
      const parsed = parseCommand(msg.text, botName || me?.username || "");
      if (parsed.foreign) return; // /cmd@otherbot in a group
      await onMessage?.({ chatId, from: msg.from || null, command: parsed.command, args: parsed.args, text: parsed.text, rest: parsed.rest ?? parsed.text, messageId: msg.message_id, update });
      return;
    }
    const cb = update.callback_query;
    if (cb) {
      const chatId = cb.message?.chat?.id ?? cb.from?.id;
      if (!chatOk(chatId)) { lg.warn("telegram.ignored_callback", { chatId }); return; }
      await onCallback?.({ id: cb.id, chatId, from: cb.from || null, data: cb.data ?? "", messageId: cb.message?.message_id ?? null, update });
    }
  }

  async function pollOnce() {
    ctl = new AbortController();
    const kill = setTimeout(() => ctl.abort(), (pollTimeoutSec + 10) * 1000);
    try {
      return await api("getUpdates", { offset, timeout: pollTimeoutSec, allowed_updates: ["message", "edited_message", "callback_query"] }, { signal: ctl.signal });
    } finally { clearTimeout(kill); ctl = null; }
  }

  async function runLoop() {
    let backoff = backoffMs;
    while (running) {
      let updates;
      try { updates = await pollOnce(); backoff = backoffMs; }
      catch (e) {
        if (!running) break;
        const wait = e.retryAfter ? e.retryAfter * 1000 : backoff;
        lg.warn("telegram.poll.fail", { error: e.message, code: e.code, waitMs: wait });
        if (e.code === 401) { running = false; lg.error("telegram.unauthorized: bad bot token; polling stopped"); break; }
        await sleep(wait); backoff = Math.min(backoff * 2, 30_000);
        continue;
      }
      for (const u of updates || []) {
        try { await handle(u); } catch (e) { lg.error("telegram.handle.fail", e); }
      }
      if (!updates?.length && idleDelayMs) await sleep(idleDelayMs);
    }
  }

  function start() {
    if (running) return loop;
    running = true;
    loop = runLoop().catch((e) => lg.error("telegram.loop.crash", e)).finally(() => { running = false; });
    getMe().then((m) => lg.info("telegram.ready", { bot: m.username })).catch((e) => lg.warn("telegram.getMe.fail", { error: e.message }));
    return loop;
  }

  async function stop() {
    running = false;
    ctl?.abort();
    await loop;
    loop = null;
  }

  return { api, sendMessage, sendPhoto, sendVideo, answerCallback, editButtons, editText, getMe, start, stop, escapeHtml, chunk, parseCommand, get running() { return running; }, get offset() { return offset; } };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
