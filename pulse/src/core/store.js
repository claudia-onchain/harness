// SQLite store (node:sqlite, WAL) for the PLAN data model. Typed methods per table, snake_case rows as in the
// schema, JSON columns parsed on the way out. Timestamps are ISO-8601 UTC strings (they sort lexicographically).
// Cost ticks are INTEGER: 1 tick = 1e-10 USD, so $1000 = 1e13 < 2^53 — plain JS numbers stay exact.
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const TICKS_PER_USD = 10_000_000_000;
export const ticksToUsd = (t) => Number(t || 0) / TICKS_PER_USD;
export const usdToTicks = (u) => Math.round(Number(u || 0) * TICKS_PER_USD);

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no 0/o/1/l: ids get typed into Telegram
export function uid(prefix = "id", len = 8) {
  const b = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return `${prefix}_${s}`;
}

export const nowIso = () => new Date().toISOString();
export const dayOf = (d = new Date()) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

const MIGRATIONS = [
  `CREATE TABLE routines (
     id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, config_json TEXT NOT NULL DEFAULT '{}',
     enabled INTEGER NOT NULL DEFAULT 1, every_min REAL, at_utc TEXT, chat_id TEXT,
     cap_usd_run REAL, cap_usd_day REAL, created_at TEXT NOT NULL, last_run_at TEXT, next_run_at TEXT);
   CREATE TABLE runs (
     id TEXT PRIMARY KEY, routine_id TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, status TEXT NOT NULL,
     cost_ticks INTEGER NOT NULL DEFAULT 0, posts_fetched INTEGER NOT NULL DEFAULT 0, tool_calls_json TEXT, error TEXT);
   CREATE INDEX runs_routine ON runs(routine_id, started_at);
   CREATE TABLE responses (
     id TEXT PRIMARY KEY, run_id TEXT NOT NULL, model TEXT, request_json TEXT, response_json TEXT,
     cost_ticks INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
   CREATE INDEX responses_run ON responses(run_id, created_at);
   CREATE TABLE alerts (
     id TEXT PRIMARY KEY, run_id TEXT, routine_id TEXT NOT NULL, severity TEXT NOT NULL, headline TEXT NOT NULL,
     summary TEXT, sentiment REAL, velocity REAL, posts_json TEXT, media_url TEXT, sent_at TEXT, chat_id TEXT,
     created_at TEXT NOT NULL);
   CREATE INDEX alerts_routine ON alerts(routine_id, created_at);
   CREATE TABLE posts_seen (url TEXT PRIMARY KEY, routine_id TEXT, first_seen_at TEXT NOT NULL);
   CREATE TABLE costs (day TEXT NOT NULL, routine_id TEXT NOT NULL, ticks INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, routine_id));
   CREATE TABLE approvals (
     id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload_json TEXT, status TEXT NOT NULL DEFAULT 'pending',
     created_at TEXT NOT NULL, expires_at TEXT, decided_at TEXT, decided_by TEXT);`,
];

const parse = (s, fb) => { try { return s == null ? fb : JSON.parse(s); } catch { return fb; } };
const J = (v) => (v == null ? null : JSON.stringify(v));

export function openStore(path = ":memory:") {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);

  const stmts = new Map();
  const q = (sql) => { let s = stmts.get(sql); if (!s) { s = db.prepare(sql); stmts.set(sql, s); } return s; };
  const one = (sql, ...a) => q(sql).get(...a) ?? null;
  const all = (sql, ...a) => q(sql).all(...a);
  const run = (sql, ...a) => q(sql).run(...a);

  const routineRow = (r) => (r ? { ...r, enabled: !!r.enabled, config: parse(r.config_json, {}) } : null);
  const alertRow = (r) => (r ? { ...r, posts: parse(r.posts_json, []) } : null);
  const approvalRow = (r) => (r ? { ...r, payload: parse(r.payload_json, null) } : null);
  const runRow = (r) => (r ? { ...r, tool_calls: parse(r.tool_calls_json, null) } : null);
  const responseRow = (r) => (r ? { ...r, request: parse(r.request_json, null), response: parse(r.response_json, null) } : null);

  const routines = {
    insert({ id = uid("rt"), kind, name, config = {}, enabled = true, everyMin = null, atUtc = null, chatId = null, capUsdRun = null, capUsdDay = null, nextRunAt = null }) {
      if (!kind || !name) throw new Error("routine needs kind and name");
      if (everyMin == null && atUtc == null) throw new Error("routine needs every_min or at_utc");
      run(`INSERT INTO routines (id, kind, name, config_json, enabled, every_min, at_utc, chat_id, cap_usd_run, cap_usd_day, created_at, next_run_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, kind, name, JSON.stringify(config), enabled ? 1 : 0, everyMin, atUtc, chatId == null ? null : String(chatId), capUsdRun, capUsdDay, nowIso(), nextRunAt);
      return routines.get(id);
    },
    update(id, patch) {
      const cur = routines.get(id);
      if (!cur) return null;
      const cols = { name: "name", kind: "kind", everyMin: "every_min", atUtc: "at_utc", chatId: "chat_id", capUsdRun: "cap_usd_run", capUsdDay: "cap_usd_day", nextRunAt: "next_run_at", lastRunAt: "last_run_at" };
      const sets = [], vals = [];
      for (const [k, col] of Object.entries(cols)) if (k in patch) { sets.push(`${col} = ?`); vals.push(patch[k] == null ? null : col === "chat_id" ? String(patch[k]) : patch[k]); }
      if ("enabled" in patch) { sets.push("enabled = ?"); vals.push(patch.enabled ? 1 : 0); }
      if ("config" in patch) { sets.push("config_json = ?"); vals.push(JSON.stringify({ ...cur.config, ...patch.config })); }
      if (sets.length) run(`UPDATE routines SET ${sets.join(", ")} WHERE id = ?`, ...vals, id);
      return routines.get(id);
    },
    get: (id) => routineRow(one("SELECT * FROM routines WHERE id = ?", id)),
    list({ kind, enabledOnly = false } = {}) {
      const where = [], vals = [];
      if (kind) { where.push("kind = ?"); vals.push(kind); }
      if (enabledOnly) where.push("enabled = 1");
      return all(`SELECT * FROM routines ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at`, ...vals).map(routineRow);
    },
    /** Enabled routines whose next_run_at is unset or in the past. */
    due: (now = nowIso()) => all("SELECT * FROM routines WHERE enabled = 1 AND (next_run_at IS NULL OR next_run_at <= ?) ORDER BY next_run_at", now).map(routineRow),
    enable: (id) => routines.update(id, { enabled: true }),
    disable: (id) => routines.update(id, { enabled: false }),
    /** Stamp scheduling columns; either may be omitted. */
    touch(id, { nextRunAt, lastRunAt } = {}) {
      const patch = {};
      if (nextRunAt !== undefined) patch.nextRunAt = nextRunAt instanceof Date ? nextRunAt.toISOString() : nextRunAt;
      if (lastRunAt !== undefined) patch.lastRunAt = lastRunAt instanceof Date ? lastRunAt.toISOString() : lastRunAt;
      return routines.update(id, patch);
    },
    remove(id) { return run("DELETE FROM routines WHERE id = ?", id).changes > 0; },
  };

  const runs = {
    start({ id = uid("run"), routineId, startedAt = nowIso() }) {
      run("INSERT INTO runs (id, routine_id, started_at, status) VALUES (?, ?, ?, 'running')", id, routineId, startedAt);
      return runs.get(id);
    },
    finish(id, { status = "ok", error = null, postsFetched, toolCalls, costTicks, endedAt = nowIso() } = {}) {
      const sets = ["status = ?", "ended_at = ?", "error = ?"], vals = [status, endedAt, error == null ? null : String(error).slice(0, 2000)];
      if (postsFetched != null) { sets.push("posts_fetched = ?"); vals.push(postsFetched); }
      if (toolCalls != null) { sets.push("tool_calls_json = ?"); vals.push(J(toolCalls)); }
      if (costTicks != null) { sets.push("cost_ticks = ?"); vals.push(Math.round(costTicks)); }
      run(`UPDATE runs SET ${sets.join(", ")} WHERE id = ?`, ...vals, id);
      return runs.get(id);
    },
    addTicks(id, ticks) { run("UPDATE runs SET cost_ticks = cost_ticks + ? WHERE id = ?", Math.round(ticks || 0), id); return runs.get(id)?.cost_ticks ?? 0; },
    get: (id) => runRow(one("SELECT * FROM runs WHERE id = ?", id)),
    list({ routineId, limit = 50 } = {}) {
      return (routineId
        ? all("SELECT * FROM runs WHERE routine_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?", routineId, limit)
        : all("SELECT * FROM runs ORDER BY started_at DESC, rowid DESC LIMIT ?", limit)).map(runRow);
    },
    /** Runs left 'running' by a previous process are dead: mark them so they stop looking in-flight. */
    abortStale() { return run("UPDATE runs SET status = 'aborted', ended_at = ?, error = 'process exited mid-run' WHERE status = 'running'", nowIso()).changes; },
  };

  const responses = {
    append({ id = uid("rs"), runId, model = null, request = null, response = null, costTicks = 0 }) {
      run("INSERT INTO responses (id, run_id, model, request_json, response_json, cost_ticks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        id, runId, model, J(request), J(response), Math.round(costTicks || 0), nowIso());
      return responses.get(id);
    },
    get: (id) => responseRow(one("SELECT * FROM responses WHERE id = ?", id)),
    byRun: (runId) => all("SELECT * FROM responses WHERE run_id = ? ORDER BY created_at, rowid", runId).map(responseRow),
  };

  const alerts = {
    insert({ id = uid("al"), runId = null, routineId, severity = "low", headline, summary = null, sentiment = null, velocity = null, posts = [], mediaUrl = null, chatId = null }) {
      if (!routineId || !headline) throw new Error("alert needs routineId and headline");
      run(`INSERT INTO alerts (id, run_id, routine_id, severity, headline, summary, sentiment, velocity, posts_json, media_url, chat_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, runId, routineId, severity, headline, summary, sentiment, velocity, JSON.stringify(posts), mediaUrl, chatId == null ? null : String(chatId), nowIso());
      return alerts.get(id);
    },
    get: (id) => alertRow(one("SELECT * FROM alerts WHERE id = ?", id)),
    list({ routineId, limit = 20, since } = {}) {
      const where = [], vals = [];
      if (routineId) { where.push("routine_id = ?"); vals.push(routineId); }
      if (since) { where.push("created_at >= ?"); vals.push(since instanceof Date ? since.toISOString() : since); }
      return all(`SELECT * FROM alerts ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC, rowid DESC LIMIT ?`, ...vals, limit).map(alertRow);
    },
    markSent(id, { chatId, sentAt = nowIso(), mediaUrl } = {}) {
      run("UPDATE alerts SET sent_at = ?, chat_id = COALESCE(?, chat_id), media_url = COALESCE(?, media_url) WHERE id = ?", sentAt, chatId == null ? null : String(chatId), mediaUrl ?? null, id);
      return alerts.get(id);
    },
  };

  const postsSeen = {
    has: (url) => !!one("SELECT 1 AS x FROM posts_seen WHERE url = ?", url),
    /** Insert unseen urls; returns the ones that were new. */
    addMany(urls, routineId = null) {
      const fresh = [];
      const ins = q("INSERT OR IGNORE INTO posts_seen (url, routine_id, first_seen_at) VALUES (?, ?, ?)");
      const ts = nowIso();
      db.exec("BEGIN");
      try { for (const u of urls || []) if (u && ins.run(String(u), routineId, ts).changes) fresh.push(String(u)); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
      return fresh;
    },
    filterNew: (urls) => (urls || []).filter((u) => u && !postsSeen.has(u)),
    count: () => one("SELECT COUNT(*) AS n FROM posts_seen").n,
    prune(days = 30) { return run("DELETE FROM posts_seen WHERE first_seen_at <= ?", new Date(Date.now() - days * 86_400_000).toISOString()).changes; },
  };

  const costs = {
    addTicks(day, routineId, ticks) {
      const t = Math.round(Number(ticks) || 0);
      run("INSERT INTO costs (day, routine_id, ticks) VALUES (?, ?, ?) ON CONFLICT(day, routine_id) DO UPDATE SET ticks = ticks + excluded.ticks", day, routineId || "_", t);
      return costs.today(routineId, day);
    },
    /** Ticks spent on `day` (default today), for one routine or everything. */
    today(routineId, day = dayOf()) {
      const r = routineId
        ? one("SELECT COALESCE(SUM(ticks), 0) AS t FROM costs WHERE day = ? AND routine_id = ?", day, routineId)
        : one("SELECT COALESCE(SUM(ticks), 0) AS t FROM costs WHERE day = ?", day);
      const ticks = Number(r?.t || 0);
      return { day, routineId: routineId || null, ticks, usd: ticksToUsd(ticks) };
    },
    /** Last n days (including today), newest first, with the per-routine breakdown. Days with no spend are omitted. */
    byDay(n = 7) {
      const from = dayOf(new Date(Date.now() - (n - 1) * 86_400_000));
      const rows = all("SELECT day, routine_id, ticks FROM costs WHERE day >= ? ORDER BY day DESC, ticks DESC", from);
      const days = new Map();
      for (const r of rows) {
        const d = days.get(r.day) || { day: r.day, ticks: 0, usd: 0, byRoutine: [] };
        d.ticks += Number(r.ticks); d.usd = ticksToUsd(d.ticks);
        d.byRoutine.push({ routine_id: r.routine_id, ticks: Number(r.ticks), usd: ticksToUsd(r.ticks) });
        days.set(r.day, d);
      }
      return [...days.values()];
    },
    byRoutine(day = dayOf()) { return all("SELECT routine_id, ticks FROM costs WHERE day = ? ORDER BY ticks DESC", day).map((r) => ({ routine_id: r.routine_id, ticks: Number(r.ticks), usd: ticksToUsd(r.ticks) })); },
  };

  const approvals = {
    create({ id = uid("ap"), kind, payload = null, expiresAt = null }) {
      run("INSERT INTO approvals (id, kind, payload_json, status, created_at, expires_at) VALUES (?, ?, ?, 'pending', ?, ?)",
        id, kind, J(payload), nowIso(), expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt);
      return approvals.get(id);
    },
    get: (id) => approvalRow(one("SELECT * FROM approvals WHERE id = ?", id)),
    listPending: () => all("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at").map(approvalRow),
    /** status: approved | denied | expired. Only a pending row can be decided; returns null otherwise. */
    decide(id, status, by = null) {
      const r = run("UPDATE approvals SET status = ?, decided_at = ?, decided_by = ? WHERE id = ? AND status = 'pending'", status, nowIso(), by, id);
      return r.changes ? approvals.get(id) : null;
    },
    expire(now = nowIso()) {
      const rows = all("SELECT id FROM approvals WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ?", now);
      for (const r of rows) approvals.decide(r.id, "expired", "clock");
      return rows.map((r) => r.id);
    },
  };

  return {
    db, path,
    routines, runs, responses, alerts, postsSeen, costs, approvals,
    /** Table row counts, for `pulse doctor`. */
    stats() {
      const t = {};
      for (const n of ["routines", "runs", "responses", "alerts", "posts_seen", "costs", "approvals"]) t[n] = one(`SELECT COUNT(*) AS n FROM ${n}`).n;
      return t;
    },
    close() { try { db.close(); } catch { /* already closed */ } },
  };
}

function migrate(db) {
  const v = db.prepare("PRAGMA user_version").get().user_version;
  for (let i = v; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    try { db.exec(MIGRATIONS[i]); db.exec(`PRAGMA user_version = ${i + 1}`); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
  }
}
