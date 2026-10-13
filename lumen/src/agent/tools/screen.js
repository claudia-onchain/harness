// macOS screen tools ("show me").
import { obj, str, num, arr, bool } from "./registry.js";
import * as screen from "../../screen/index.js";
import { wrap } from "../../core/untrusted.js";

const marker = obj({
  x: num("Left (px, top-left origin)"), y: num("Top"), w: num("Width (arrow: dx)"), h: num("Height (arrow: dy)"),
  label: str("Label text"), color: str("violet | cyan | green | amber | red | #hex"),
  shape: { type: "string", enum: ["box", "circle", "arrow"] }, relativeTo: { type: "string", enum: ["screen", "window"] },
}, ["x", "y", "w", "h"]);

export function screenTools() {
  return [
    {
      name: "screen_open", group: "Screen", label: "Open app/URL",
      description: "Open an app, URL or file on the user's Mac (macOS only).",
      parameters: obj({ app: str("App name, e.g. Safari"), url: str("URL to open"), path: str("File path"), bundle: str("Bundle id") }),
      async run(a) { await screen.openTarget(a); return { text: `Opened ${a.url || a.path || a.app || a.bundle}.`, summary: `opened ${a.app || a.url || a.path}` }; },
    },
    {
      name: "screen_windows", group: "Screen", label: "List windows", safe: true,
      description: "List on-screen windows with bounds (x, y, width, height in points, top-left origin). Optional app filter.",
      parameters: obj({ app: str("App name filter") }),
      async run(a) {
        const w = await screen.listWindows(a.app);
        const s = await screen.screens();
        return { text: `Screens: ${JSON.stringify(s)}\nWindows:\n${w.map((x) => `${x.app} · "${x.title}" · id ${x.id} · x ${x.X} y ${x.Y} w ${x.Width} h ${x.Height}`).join("\n") || "(none)"}`, summary: `${w.length} windows` };
      },
    },
    {
      name: "screen_show", group: "Screen", label: "Show on screen",
      description: "Show the user something: open/activate an app or URL, then draw glowing click-through markers (boxes, circles, arrows with labels) that fade in, pulse and auto-close. Marker coordinates are relative to the app's front window by default when an app is given (relativeTo: window), else to the screen. With no markers the whole window is outlined.",
      parameters: obj({ app: str("App to open/activate"), url: str("URL to open"), path: str("File to open"), markers: arr(marker, "Markers to draw"), seconds: num("How long (default 5)"), label: str("Label when outlining the whole window") }),
      async run(a) {
        const r = await screen.show(a);
        if (!r.ok) return { ok: false, text: r.message, summary: r.message };
        return { text: `Showing ${r.markers.length} marker(s)${r.window ? ` on ${r.window.app} window at (${r.window.x}, ${r.window.y}) ${r.window.w}x${r.window.h}` : ""} for ${a.seconds || 5}s.`, summary: `${r.markers.length} markers${r.window ? ` on ${r.window.app}` : ""}` };
      },
    },
    {
      name: "screen_capture", group: "Screen", label: "Screenshot", safe: true,
      description: "Take a screenshot (an app's front window, a region, or the full screen) saved to ~/.lumen/uploads. The image is attached so you can see it (needs Screen Recording permission).",
      parameters: obj({ app: str("App whose window to capture"), region: obj({ x: num("x"), y: num("y"), w: num("w"), h: num("h") }), attach: bool("Attach the image for vision (default true)") }),
      async run(a) {
        const r = await screen.capture({ app: a.app, region: a.region, withData: a.attach !== false });
        return { text: `Saved ${r.path}`, images: r.dataUrl ? [r.dataUrl] : undefined, summary: r.path.split("/").pop() };
      },
    },
    {
      name: "screen_ui", group: "Screen", label: "UI scripting",
      description: "macOS System Events: read an app's window/UI element tree, list its menus, or click a menu item path like [\"File\",\"New Window\"]. Needs Accessibility permission (explains how if missing).",
      parameters: obj({ app: str("App name"), action: { type: "string", enum: ["tree", "menus", "click_menu"] }, menu: arr({ type: "string" }, "Menu path for click_menu") }, ["app"]),
      approval: "shell", approvalTitle: (a) => `${a.action || "tree"} ${a.app}`,
      async run(a) { const out = await screen.ui(a); return { text: wrap("tool", out || "(empty)", { from: `${a.app} UI` }), summary: `${a.action || "tree"} ${a.app}` }; },
    },
  ];
}
