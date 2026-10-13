// Multi-line input editor: cursor movement, word ops, history, collapsed large pastes, wrapped rendering.
import { charWidth, width } from "./ansi.js";
import { P } from "../core/paths.js";
import { readJson, writeJson } from "../core/fsx.js";

const cw = (ch) => charWidth(ch.codePointAt(0));
const isWord = (ch) => /[\p{L}\p{N}_]/u.test(ch || "");

export class Editor {
  constructor() {
    this.lines = [[]];
    this.row = 0; this.col = 0;
    this.pastes = new Map(); this.pasteN = 0;
    this.history = readJson(P.history, []).slice(-300);
    this.hIndex = -1; this.draft = null;
  }

  get text() { return this.lines.map((l) => l.join("")).join("\n"); }
  isEmpty() { return this.lines.length === 1 && this.lines[0].length === 0; }
  line() { return this.lines[this.row]; }

  setText(t) {
    this.lines = String(t).split("\n").map((l) => Array.from(l));
    this.row = this.lines.length - 1; this.col = this.lines[this.row].length;
  }

  clear() { this.lines = [[]]; this.row = 0; this.col = 0; this.hIndex = -1; this.draft = null; }

  /** Final text with collapsed pastes expanded. */
  value() { return this.text.replace(/\[Pasted text #(\d+)[^\]]*\]/g, (m, n) => this.pastes.get(Number(n)) ?? m); }

  insert(text) {
    const parts = String(text).replace(/\r\n?/g, "\n").split("\n");
    const cur = this.line();
    const after = cur.splice(this.col);
    cur.push(...Array.from(parts[0]));
    this.col = cur.length;
    for (let i = 1; i < parts.length; i++) {
      this.lines.splice(++this.row, 0, Array.from(parts[i]));
      this.col = this.lines[this.row].length;
    }
    this.line().push(...after);
  }

  paste(text) {
    const t = String(text).replace(/\r\n?/g, "\n").replace(/\t/g, "  ");
    const nl = t.split("\n").length;
    if (nl > 8 || t.length > 1200) {
      const n = ++this.pasteN;
      this.pastes.set(n, t);
      this.insert(`[Pasted text #${n} +${nl} lines]`);
    } else this.insert(t);
  }

  newline() { this.insert("\n"); }

  backspace() {
    if (this.col > 0) {
      // Delete a whole collapsed-paste token at once.
      const before = this.line().slice(0, this.col).join("");
      const m = /\[Pasted text #\d+[^\]]*\]$/.exec(before);
      const n = m ? Array.from(m[0]).length : 1;
      this.line().splice(this.col - n, n); this.col -= n;
    } else if (this.row > 0) {
      const cur = this.lines.splice(this.row, 1)[0];
      this.row--; this.col = this.line().length; this.line().push(...cur);
    }
  }

  del() {
    if (this.col < this.line().length) this.line().splice(this.col, 1);
    else if (this.row < this.lines.length - 1) { const next = this.lines.splice(this.row + 1, 1)[0]; this.line().push(...next); }
  }

  left() { if (this.col > 0) this.col--; else if (this.row > 0) { this.row--; this.col = this.line().length; } }
  right() { if (this.col < this.line().length) this.col++; else if (this.row < this.lines.length - 1) { this.row++; this.col = 0; } }
  home() { this.col = 0; }
  end() { this.col = this.line().length; }
  wordLeft() { const l = this.line(); while (this.col > 0 && !isWord(l[this.col - 1])) this.col--; while (this.col > 0 && isWord(l[this.col - 1])) this.col--; }
  wordRight() { const l = this.line(); while (this.col < l.length && !isWord(l[this.col])) this.col++; while (this.col < l.length && isWord(l[this.col])) this.col++; }
  deleteWordBack() { const end = this.col; this.wordLeft(); this.line().splice(this.col, end - this.col); }
  killToEnd() { this.line().splice(this.col); }
  killToStart() { this.line().splice(0, this.col); this.col = 0; }

  /** Up/down move within lines; at the edges they browse history. Returns true if handled. */
  up() {
    if (this.row > 0) { this.row--; this.col = Math.min(this.col, this.line().length); return true; }
    if (!this.history.length) return false;
    if (this.hIndex === -1) { this.draft = this.text; this.hIndex = this.history.length; }
    if (this.hIndex > 0) { this.hIndex--; this.setText(this.history[this.hIndex]); this.row = 0; this.col = this.lines[0].length; }
    return true;
  }

  down() {
    if (this.row < this.lines.length - 1) { this.row++; this.col = Math.min(this.col, this.line().length); return true; }
    if (this.hIndex === -1) return false;
    this.hIndex++;
    if (this.hIndex >= this.history.length) { this.setText(this.draft ?? ""); this.hIndex = -1; this.draft = null; }
    else this.setText(this.history[this.hIndex]);
    return true;
  }

  remember(text) {
    const t = String(text).trim();
    if (!t || this.history[this.history.length - 1] === t) return;
    this.history.push(t);
    this.history = this.history.slice(-300);
    try { writeJson(P.history, this.history); } catch { /* ignore */ }
  }

  /** Word fragment before the cursor (for @ and / completion). */
  tokenBeforeCursor() {
    const before = this.line().slice(0, this.col).join("");
    const m = /(\S*)$/.exec(before);
    return { token: m[1], start: this.col - Array.from(m[1]).length, row: this.row, atLineStart: before.trim() === m[1] && this.row === 0 };
  }

  replaceToken(start, text) {
    this.line().splice(start, this.col - start, ...Array.from(text));
    this.col = start + Array.from(text).length;
  }

  /**
   * Render to visual rows. Returns { lines, cursorRow, cursorCol } relative to the first returned line.
   * prefix: first-line prompt (styled), cont: continuation prefix; both must have equal visible width.
   */
  render(cols, { prefix, cont, placeholder, style = (s) => s, muted = (s) => s }) {
    const pw = width(prefix);
    const avail = Math.max(10, cols - pw - 1);
    const out = [];
    let cRow = 0, cCol = pw;
    this.lines.forEach((l, li) => {
      let row = [], w = 0;
      const rows = [];
      const starts = [0];
      l.forEach((ch, i) => {
        const x = cw(ch);
        if (w + x > avail) { rows.push(row); row = []; w = 0; starts.push(i); }
        row.push(ch); w += x;
      });
      rows.push(row);
      rows.forEach((r, ri) => {
        const isFirst = li === 0 && ri === 0;
        if (li === this.row) {
          const s = starts[ri], e = ri + 1 < starts.length ? starts[ri + 1] : Infinity;
          if (this.col >= s && (this.col < e || (ri === rows.length - 1))) {
            cRow = out.length;
            cCol = pw + width(l.slice(s, this.col).join(""));
            if (cCol >= cols) { cRow++; cCol = pw; }
          }
        }
        out.push((isFirst ? prefix : cont) + style(r.join("")));
      });
    });
    if (this.isEmpty() && placeholder) out[0] = prefix + muted(placeholder);
    return { lines: out, cursorRow: cRow, cursorCol: cCol };
  }
}
