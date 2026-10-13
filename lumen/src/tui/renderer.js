// Differential line renderer for the main screen buffer (scrollback stays native).
//
// The screen has two parts: committed lines (printed once, scroll into history) and a live region at the
// bottom (streaming text, pending tool cards, editor, footer). Each frame diffs the live region against the
// previous frame, rewrites only from the first changed line, and is wrapped in synchronized output
// (CSI ?2026h/l) so terminals that support it never show a half-drawn frame. Lines are clipped to the width
// so auto-wrap never desynchronises row accounting. A full reset (resize, Ctrl+O) clears and reprints.
import { truncate, up, cursorTo, SYNC_START, SYNC_END, HIDE_CURSOR, SHOW_CURSOR, CLEAR_EOL, CLEAR_DOWN } from "./ansi.js";

export class Screen {
  constructor(out = process.stdout) {
    this.out = out;
    this.prev = [];
    this.cursorRow = 0;
    this.pending = [];
    this.cols = out.columns || 80;
    this.rows = out.rows || 24;
    this.cursorShown = true;
  }

  size() { this.cols = this.out.columns || this.cols || 80; this.rows = this.out.rows || this.rows || 24; return { cols: this.cols, rows: this.rows }; }

  fit(l) { return truncate(String(l ?? ""), this.cols, ""); }

  /** Queue lines to print permanently above the live region (flushed with the next frame). */
  commit(lines) { for (const l of lines) this.pending.push(l); }

  /** Draw the live region. cursor = { row, col } inside it, or null to hide the cursor. */
  frame(lines, cursor = null) {
    const max = Math.max(1, this.rows - 1);
    let next = lines.map((l) => this.fit(l));
    if (next.length > max) next = next.slice(next.length - max);
    if (!next.length) next = [""];
    let buf = SYNC_START + HIDE_CURSOR + up(this.cursorRow) + "\r";
    let prev = this.prev;
    if (this.pending.length) {
      for (const l of this.pending) buf += this.fit(l) + "\x1b[0m" + CLEAR_EOL + "\r\n";
      this.pending = [];
      prev = [];
    }
    let first = 0;
    while (first < prev.length && first < next.length && prev[first] === next[first]) first++;
    if (first === next.length && prev.length === next.length) {
      buf += next.length > 1 ? `\x1b[${next.length - 1}B` : "";
    } else {
      const start = Math.min(first, next.length - 1);
      // Rows below the previous frame don't exist yet: CSI B can't scroll, so step there with a newline.
      if (start > 0 && start < prev.length) buf += `\x1b[${start}B`;
      else if (start > 0) buf += (prev.length > 1 ? `\x1b[${prev.length - 1}B` : "") + "\r\n".repeat(start - prev.length + 1);
      for (let i = start; i < next.length; i++) buf += "\r" + next[i] + "\x1b[0m" + CLEAR_EOL + (i < next.length - 1 ? "\r\n" : "");
      buf += CLEAR_DOWN;
    }
    const last = next.length - 1;
    if (cursor && cursor.row >= 0) {
      const r = Math.min(last, Math.max(0, cursor.row - (lines.length - next.length)));
      buf += up(last - r) + cursorTo(Math.min(this.cols - 1, cursor.col)) + SHOW_CURSOR;
      this.cursorRow = r;
    } else {
      buf += cursorTo(0);
      this.cursorRow = last;
    }
    buf += SYNC_END;
    this.prev = next;
    this.out.write(buf);
  }

  /** Clear screen + scrollback and reprint everything (used on resize and for expand/collapse). */
  reset(committed, live, cursor) {
    this.size();
    this.out.write(SYNC_START + "\x1b[H\x1b[2J\x1b[3J" + SYNC_END);
    this.prev = []; this.cursorRow = 0; this.pending = [];
    this.commit(committed);
    this.frame(live, cursor);
  }

  /** Leave the live region in place and move below it (on exit). */
  finish(keepLines = null) {
    if (keepLines) this.frame(keepLines, null);
    const below = Math.max(0, this.prev.length - 1 - this.cursorRow);
    this.out.write((below ? `\x1b[${below}B` : "") + "\r\n" + SHOW_CURSOR + "\x1b[0m");
    this.prev = []; this.cursorRow = 0;
  }
}
