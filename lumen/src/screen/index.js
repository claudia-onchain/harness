// macOS "show me": open apps/URLs, list windows, draw click-through markers, capture the screen, and
// optional System Events UI scripting. Everything else reports unsupported.
import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { nativeDir, P, ensureHome } from "../core/paths.js";
import { sleep } from "../core/util.js";

export const supported = () => process.platform === "darwin";
const MAC = join(nativeDir, "macos");

function run(cmd, args, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ ok: !err, code: err?.code ?? 0, stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() || err?.message || "" }));
  });
}

function need() {
  if (!supported()) throw Object.assign(new Error(`Screen control is macOS-only (this is ${process.platform}).`), { code: "unsupported" });
}

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Open an app (name or bundle id), a URL or a file. */
export async function openTarget({ app, url, path, bundle } = {}) {
  need();
  let r;
  if (url) r = await run("open", app ? ["-a", app, url] : [url]);
  else if (path) r = await run("open", app ? ["-a", app, path] : [path]);
  else if (bundle) r = await run("open", ["-b", bundle]);
  else if (app) r = await run("open", ["-a", app]);
  else throw new Error("Give an app, url, path or bundle id.");
  if (!r.ok) throw new Error(r.stderr || `open failed (${r.code})`);
  return { ok: true };
}

export async function activate(app) {
  need();
  const r = await run("osascript", ["-e", `tell application "${esc(app)}" to activate`]);
  return r.ok;
}

/** [{ app, title, layer, pid, id, X, Y, Width, Height }] (titles need Screen Recording permission). */
export async function listWindows(app) {
  need();
  const r = await run("osascript", ["-l", "JavaScript", join(MAC, "winlist.js"), ...(app ? [app] : [])]);
  if (!r.ok) throw new Error(r.stderr);
  try { return JSON.parse(r.stdout).filter((w) => w.layer === 0 && w.Width > 40 && w.Height > 40); } catch { return []; }
}

export async function screens() {
  need();
  const r = await run("osascript", ["-l", "JavaScript", join(MAC, "screens.js")]);
  try { return JSON.parse(r.stdout); } catch { return [{ index: 0, x: 0, y: 0, w: 1440, h: 900, main: true }]; }
}

/** The app's frontmost (first listed, on-screen order) normal window. */
export async function frontWindow(app) {
  const wins = await listWindows(app);
  if (!wins.length) return null;
  const lc = String(app).toLowerCase();
  return wins.find((w) => String(w.app).toLowerCase() === lc) || wins.find((w) => String(w.app).toLowerCase().includes(lc)) || null;
}


/**
 * Show something: open/activate the app or URL, then draw markers.
 * markers: [{ x, y, w, h, label?, color?, shape?, relativeTo?: "screen"|"window" }]
 * With no markers, the whole target window is outlined (label = `label` or the app name).
 */
export async function show({ app, url, path, markers = [], seconds = 5, label, wait = false } = {}) {
  need();
  if (url || path) await openTarget({ app, url, path });
  else if (app) { await openTarget({ app }); await activate(app); }
  if (url || path || app) await sleep(900);
  let win = null;
  const targetApp = app || (url ? await defaultBrowser() : path ? await frontmostApp() : null);
  if (targetApp) {
    for (let i = 0; i < 4 && !win; i++) { win = await frontWindow(targetApp); if (!win) await sleep(400); }
  }
  let list = (markers || []).map((m) => ({ ...m }));
  if (!list.length) {
    if (!win) return { ok: false, message: `Opened ${targetApp || url || path}, but couldn't find its window to highlight.` };
    list = [{ x: 0, y: 0, w: win.Width, h: win.Height, label: label || targetApp, relativeTo: "window", color: "violet" }];
  }
  const resolved = list.map((m) => {
    const rel = m.relativeTo === "window" || (m.relativeTo !== "screen" && win && m.relativeTo === undefined && app);
    const ox = rel && win ? win.X : 0, oy = rel && win ? win.Y : 0;
    return { x: Number(m.x || 0) + ox, y: Number(m.y || 0) + oy, w: Number(m.w || 0), h: Number(m.h || 0), label: m.label, color: m.color, shape: m.shape || "box" };
  });
  const spec = JSON.stringify({ seconds: Math.max(1, Math.min(60, Number(seconds) || 5)), markers: resolved });
  const child = spawn("osascript", ["-l", "JavaScript", join(MAC, "markers.js"), spec], { stdio: wait ? ["ignore", "pipe", "pipe"] : "ignore", detached: !wait });
  if (wait) {
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    await new Promise((r) => child.on("close", r));
    return { ok: true, window: win, markers: resolved, result: out.trim() };
  }
  child.unref();
  return { ok: true, window: win ? { app: win.app, title: win.title, x: win.X, y: win.Y, w: win.Width, h: win.Height } : null, markers: resolved };
}

/** The default browser's app name (LaunchServices https handler), or null. */
export async function defaultBrowser() {
  const r = await run("defaults", ["read", "com.apple.LaunchServices/com.apple.launchservices.secure", "LSHandlers"]);
  const m = /LSHandlerRoleAll = "?([\w.-]+)"?;\s*LSHandlerURLScheme = https;/.exec(r.stdout);
  const bundle = m?.[1] || "com.apple.safari";
  const n = await run("osascript", ["-e", `name of application id "${esc(bundle)}"`]);
  return n.ok ? n.stdout : "Safari";
}

export async function frontmostApp() {
  const r = await run("osascript", ["-e", 'tell application "System Events" to get name of first application process whose frontmost is true']);
  return r.ok ? r.stdout : null;
}

/** Screenshot to ~/.lumen/uploads. Returns { path, dataUrl? }. Needs Screen Recording permission. */
export async function capture({ app, region, windowId, withData = true } = {}) {
  need();
  ensureHome();
  const file = join(P.uploads, `screen-${Date.now()}.png`);
  const args = ["-x"];
  if (windowId) args.push("-l", String(windowId));
  else if (app) { const w = await frontWindow(app); if (!w) throw new Error(`No window found for ${app}.`); args.push("-l", String(w.id)); }
  else if (region) args.push("-R", [region.x, region.y, region.w, region.h].map((n) => Math.round(n)).join(","));
  args.push(file);
  const r = await run("screencapture", args);
  if (!r.ok || !existsSync(file) || statSync(file).size === 0) {
    throw new Error("Screen capture failed. macOS needs Screen Recording permission for your terminal: System Settings → Privacy & Security → Screen & System Audio Recording → enable your terminal app, then restart it.");
  }
  return { path: file, ...(withData ? { dataUrl: `data:image/png;base64,${readFileSync(file).toString("base64")}` } : {}) };
}

const AX_HELP = "This needs the Accessibility permission: System Settings → Privacy & Security → Accessibility → enable your terminal app (Terminal, iTerm, Ghostty…), then try again.";

/** System Events UI scripting: { action: "tree" | "click_menu" | "menus", app, menu?: ["File","New Window"] } */
export async function ui({ action = "tree", app, menu = [] } = {}) {
  need();
  if (!app) throw new Error("Give the app name.");
  let script;
  if (action === "click_menu") {
    if (menu.length < 2) throw new Error('menu needs at least ["Menu", "Item"].');
    const [top, ...rest] = menu;
    let ref = `menu bar item "${esc(top)}" of menu bar 1`;
    rest.forEach((item, i) => { ref = `menu item "${esc(item)}" of menu 1 of ${ref}`; if (i < rest.length - 1) ref = ref; });
    script = `tell application "${esc(app)}" to activate\ndelay 0.3\ntell application "System Events" to tell process "${esc(app)}" to click ${ref}`;
  } else if (action === "menus") {
    script = `tell application "System Events" to tell process "${esc(app)}" to get name of every menu bar item of menu bar 1`;
  } else {
    script = `tell application "System Events" to tell process "${esc(app)}"
set out to ""
repeat with w in windows
set out to out & "window: " & (name of w as text) & linefeed
try
repeat with e in UI elements of w
set out to out & "  " & (role of e as text) & " | " & (description of e as text) & " | " & (name of e as text) & linefeed
end repeat
end try
end repeat
return out
end tell`;
  }
  const r = await run("osascript", ["-e", script], { timeoutMs: 20000 });
  if (!r.ok) {
    if (/not allowed assistive|-1719|-25211|assistive access/i.test(r.stderr)) throw new Error(AX_HELP);
    throw new Error(r.stderr || "UI scripting failed");
  }
  return r.stdout;
}

