// Raw stdin -> key events. Handles UTF-8 text, control keys, CSI/SS3 sequences with modifiers,
// Alt-prefixed keys, bracketed paste and a lone Esc (disambiguated with a short timeout).
// Event: { name, ctrl, meta, shift, text?, paste? }
import { EventEmitter } from "node:events";

const CSI_KEYS = { A: "up", B: "down", C: "right", D: "left", H: "home", F: "end", Z: "tab", P: "f1", Q: "f2", R: "f3", S: "f4" };
const TILDE = { 1: "home", 2: "insert", 3: "delete", 4: "end", 5: "pageup", 6: "pagedown", 7: "home", 8: "end", 15: "f5", 17: "f6", 18: "f7", 19: "f8", 20: "f9", 21: "f10", 23: "f11", 24: "f12" };

function mods(n) {
  const m = Math.max(0, (Number(n) || 1) - 1);
  return { shift: !!(m & 1), meta: !!(m & 2), ctrl: !!(m & 4) };
}

export function parseKeys(data) {
  const out = [];
  const s = String(data);
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\x1b") {
      const rest = s.slice(i);
      let m;
      if ((m = /^\x1b\[(\d+);?(\d*)~/.exec(rest))) { out.push({ name: TILDE[m[1]] || `key${m[1]}`, ...mods(m[2]) }); i += m[0].length; continue; }
      if ((m = /^\x1b\[(\d+);(\d+)u/.exec(rest))) { // CSI u (kitty / modifyOtherKeys)
        const cp = Number(m[1]), md = mods(m[2]);
        const name = cp === 13 ? "enter" : cp === 9 ? "tab" : cp === 27 ? "escape" : cp === 127 ? "backspace" : String.fromCodePoint(cp).toLowerCase();
        out.push({ name, ...md, ...(name.length === 1 && !md.ctrl && !md.meta ? { text: String.fromCodePoint(cp) } : {}) });
        i += m[0].length; continue;
      }
      if ((m = /^\x1b\[(?:1;)?(\d*)([A-DHFZPQRS])/.exec(rest))) { const md = mods(m[1]); out.push({ name: CSI_KEYS[m[2]], ...md, ...(m[2] === "Z" ? { shift: true } : {}) }); i += m[0].length; continue; }
      if ((m = /^\x1bO([A-DHFPQRS])/.exec(rest))) { out.push({ name: CSI_KEYS[m[1]], shift: false, meta: false, ctrl: false }); i += m[0].length; continue; }
      if (rest.length === 1) { out.push({ name: "escape", ctrl: false, meta: false, shift: false }); i++; continue; }
      const n = rest[1];
      if (n === "\r" || n === "\n") { out.push({ name: "enter", meta: true, ctrl: false, shift: false }); i += 2; continue; }
      if (n === "\x7f" || n === "\b") { out.push({ name: "backspace", meta: true, ctrl: false, shift: false }); i += 2; continue; }
      if (n === "\x1b") { out.push({ name: "escape", ctrl: false, meta: false, shift: false }); i++; continue; }
      if (n === "[" || n === "O") { out.push({ name: "unknown", ctrl: false, meta: false, shift: false }); i += 2; while (i < s.length && !/[@-~]/.test(s[i])) i++; i++; continue; }
      const cp = n.codePointAt(0);
      out.push({ name: n.toLowerCase(), meta: true, ctrl: cp < 32, shift: n !== n.toLowerCase() });
      i += 1 + n.length;
      continue;
    }
    const cp = s.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    i += ch.length;
    if (c === "\r") out.push({ name: "enter", ctrl: false, meta: false, shift: false });
    else if (c === "\n") out.push({ name: "j", ctrl: true, meta: false, shift: false, newline: true });
    else if (c === "\t") out.push({ name: "tab", ctrl: false, meta: false, shift: false });
    else if (c === "\x7f" || c === "\b") out.push({ name: "backspace", ctrl: false, meta: false, shift: false });
    else if (cp === 0) out.push({ name: "space", ctrl: true, meta: false, shift: false });
    else if (cp < 27) out.push({ name: String.fromCharCode(cp + 96), ctrl: true, meta: false, shift: false });
    else if (cp < 32) out.push({ name: `ctrl-${cp}`, ctrl: true, meta: false, shift: false });
    else out.push({ name: ch.length === 1 && /[a-z]/i.test(ch) ? ch.toLowerCase() : ch, text: ch, ctrl: false, meta: false, shift: ch !== ch.toLowerCase() });
  }
  return out;
}

/** Reads stdin in raw mode and emits "key" events. Coalesces typed text bursts and bracketed paste. */
export class KeyReader extends EventEmitter {
  constructor(stdin = process.stdin) {
    super();
    this.stdin = stdin;
    this.buf = "";
    this.pasting = null;
    this.escTimer = null;
    this.onData = (d) => this.feed(String(d));
  }

  start() {
    if (this.stdin.isTTY) this.stdin.setRawMode(true);
    this.stdin.setEncoding?.("utf8");
    this.stdin.on("data", this.onData);
    this.stdin.resume();
  }

  stop() {
    this.stdin.off("data", this.onData);
    if (this.stdin.isTTY) { try { this.stdin.setRawMode(false); } catch { /* closed */ } }
    this.stdin.pause();
  }

  feed(data) {
    clearTimeout(this.escTimer);
    this.buf += data;
    for (;;) {
      if (this.pasting !== null) {
        const end = this.buf.indexOf("\x1b[201~");
        if (end < 0) { this.pasting += this.buf; this.buf = ""; return; }
        this.pasting += this.buf.slice(0, end);
        this.buf = this.buf.slice(end + 6);
        this.emit("key", { name: "paste", paste: this.pasting.replace(/\r\n?/g, "\n"), ctrl: false, meta: false, shift: false });
        this.pasting = null;
        continue;
      }
      const start = this.buf.indexOf("\x1b[200~");
      if (start >= 0) {
        this.emitKeys(this.buf.slice(0, start));
        this.buf = this.buf.slice(start + 6);
        this.pasting = "";
        continue;
      }
      break;
    }
    // A trailing lone ESC may be the start of a sequence: wait briefly.
    if (this.buf.endsWith("\x1b")) {
      const head = this.buf.slice(0, -1);
      this.buf = "\x1b";
      this.emitKeys(head);
      this.escTimer = setTimeout(() => { const b = this.buf; this.buf = ""; this.emitKeys(b); }, 35);
      return;
    }
    const b = this.buf; this.buf = "";
    this.emitKeys(b);
  }

  emitKeys(s) {
    if (!s) return;
    const keys = parseKeys(s);
    // Unbracketed multi-line pastes arrive as one burst: treat bursts with newlines + text as paste.
    if (keys.length > 3 && /[\r\n][^\r\n]/.test(s) && keys.filter((k) => k.text).length > 2 && !/\x1b/.test(s)) {
      this.emit("key", { name: "paste", paste: s.replace(/\r\n?/g, "\n"), ctrl: false, meta: false, shift: false });
      return;
    }
    for (const k of keys) this.emit("key", k);
  }
}
