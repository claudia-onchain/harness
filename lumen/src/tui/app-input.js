// Input helpers for the TUI App (mixed into App.prototype): completion popup (/ commands, @ files) and key
// handling for approvals, select lists and text prompts.
import { extname, relative, sep } from "node:path";
import { walk } from "../agent/tools/files.js";
import * as C from "./components.js";

export const IMG = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

export function fuzzy(q, s) {
  q = q.toLowerCase(); s = s.toLowerCase();
  let i = 0, score = 0, last = -1;
  for (let j = 0; j < s.length && i < q.length; j++) if (s[j] === q[i]) { score += j === last + 1 ? 3 : 1; if (j === 0 || "/._-".includes(s[j - 1])) score += 2; last = j; i++; }
  return i === q.length ? score - s.length * 0.01 : -1;
}

export const inputMethods = {
  // ── completion popup ─────────────────────────────────────────────────────
  popup() {
    const { token, atLineStart } = this.editor.tokenBeforeCursor();
    if (token.startsWith("/") && atLineStart && !token.includes(" ")) {
      const q = token.slice(1);
      const list = this.commands.filter((c) => !q || c.name.startsWith(q) || fuzzy(q, c.name) > 0).slice(0, 8);
      const skills = q.startsWith("skill:") ? this.rt.skills.list({ q: q.slice(6) || undefined }).slice(0, 8).map((s) => ({ label: `/skill:${s.slug}`, detail: s.description.slice(0, 60), insert: `/skill:${s.slug} ` })) : [];
      const items = [...list.map((c) => ({ label: `/${c.name}`, detail: c.description, insert: `/${c.name}${c.args ? " " : ""}` })), ...skills];
      if (!items.length || (items.length === 1 && items[0].label === token)) return null;
      return { kind: "cmd", token, items: items.slice(0, 8) };
    }
    if (token.startsWith("@")) {
      const q = token.slice(1);
      const files = this.files();
      const ranked = (q ? files.map((f) => ({ f, s: fuzzy(q, f) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).map((x) => x.f) : files).slice(0, 8);
      if (!ranked.length) return null;
      return { kind: "file", token, items: ranked.map((f) => ({ label: f, detail: IMG.has(extname(f).toLowerCase()) ? "image" : "", insert: `@${f} ` })) };
    }
    return null;
  },

  files() {
    if (Date.now() - this.fileCache.at < 10000) return this.fileCache.files;
    const files = [];
    for (const f of walk(this.rt.cwd, { max: 4000 })) files.push(relative(this.rt.cwd, f).split(sep).join("/"));
    this.fileCache = { at: Date.now(), files };
    return files;
  },

  acceptPopup(pop) {
    const it = pop.items[Math.min(this.popupIndex, pop.items.length - 1)];
    const { start } = this.editor.tokenBeforeCursor();
    this.editor.replaceToken(start, it.insert);
    this.popupIndex = 0;
  },

  approvalKey(a, k) {
    const resolve = (approve, answer) => { this.approvals.shift(); this.rt.approvals.resolve(a.id, { approve, answer }); this.render(); };
    const inp = a.input;
    if (a.kind === "question") {
      const opts = a.options || [];
      if (k.name === "escape") return resolve(false, null);
      if (k.name === "up" && opts.length) inp.index = (inp.index - 1 + opts.length) % opts.length;
      else if (k.name === "down" && opts.length) inp.index = (inp.index + 1) % opts.length;
      else if (k.name === "enter") return resolve(true, inp.text.trim() || opts[inp.index] || "");
      else if (k.name === "backspace") inp.text = inp.text.slice(0, -1);
      else if (k.name === "paste") inp.text += k.paste;
      else if (k.text && /^[1-9]$/.test(k.text) && !inp.text && opts[Number(k.text) - 1]) return resolve(true, opts[Number(k.text) - 1]);
      else if (k.text) inp.text += k.text;
      return this.render();
    }
    if (a.confirmText) {
      if (k.name === "escape" || (k.ctrl && k.name === "c")) return resolve(false, null);
      if (k.name === "enter") return resolve(inp.text.trim().toLowerCase() === a.confirmText, inp.text.trim());
      if (k.name === "backspace") inp.text = inp.text.slice(0, -1);
      else if (k.text) inp.text += k.text;
      return this.render();
    }
    if (k.name === "y") return resolve(true);
    if (k.name === "n" || k.name === "escape" || (k.ctrl && k.name === "c")) return resolve(false);
    if (k.name === "a" && a.kind !== "tx") { this.autoApprove.add(a.kind); this.note(`Allowing all ${a.kind} approvals for this session.`, "warn"); return resolve(true); }
  },

  selectKey(k) {
    const st = this.overlay.st;
    const list = C.filtered(st);
    if (k.name === "escape" || (k.ctrl && k.name === "c")) return this.closeOverlay(null);
    if (k.name === "up") st.index = (st.index - 1 + Math.max(1, list.length)) % Math.max(1, list.length);
    else if (k.name === "down") st.index = (st.index + 1) % Math.max(1, list.length);
    else if (k.name === "pageup") st.index = Math.max(0, st.index - 10);
    else if (k.name === "pagedown") st.index = Math.min(list.length - 1, st.index + 10);
    else if (k.name === "enter") return this.closeOverlay(list[st.index] || null);
    else if (k.name === "backspace") { st.filter = st.filter.slice(0, -1); st.index = 0; }
    else if (k.text && !k.ctrl && !k.meta) { st.filter += k.text; st.index = 0; }
    this.render();
  },

  inputKey(k) {
    const o = this.overlay;
    if (k.name === "escape" || (k.ctrl && k.name === "c")) return this.closeOverlay(null);
    if (k.name === "enter") return this.closeOverlay(o.text.trim());
    if (k.name === "backspace") o.text = o.text.slice(0, -1);
    else if (k.name === "paste") o.text += k.paste.trim();
    else if (k.ctrl && k.name === "u") o.text = "";
    else if (k.text && !k.ctrl && !k.meta) o.text += k.text;
    this.render();
  },

};
