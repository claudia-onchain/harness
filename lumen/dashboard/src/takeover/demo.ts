// "Demo takeover": a scripted local sequence that runs WITHOUT a server, using the same op runner.
// Music: set tempo, program a beat, play. Photo: apply a filter. Triggered from Settings or ?demo=takeover.
import { sleep } from "../lib/store";
import type { UiOp } from "../lib/types";
import { caption, overlay } from "./cursor";
import { currentGeneration, execOp, TookOver } from "./runner";
import { agent } from "../state/agent";
import { toast } from "../lib/toast";

let running = false;
const op = (o: Omit<UiOp, "id">): UiOp => ({ id: `demo-${Math.random().toString(36).slice(2, 7)}`, ...o });

const BEAT: Record<string, number[]> = {
  kick: [0, 4, 8, 12],
  snare: [4, 12],
  hat: [2, 6, 10, 14],
};

export async function runDemoTakeover() {
  if (running) return;
  running = true;
  const gen = currentGeneration();
  const run = async (o: Omit<UiOp, "id">) => {
    const r = await execOp(op(o), gen);
    agent.localActivity(`dashboard.${o.op}`, o.name || o.target || o.route || o.op, "ok");
    return r;
  };
  try {
    await run({ op: "takeover_start", note: "demo: building a beat, then grading a photo" });
    overlay.set({ demo: true });
    agent.setStatus("driving", "demo takeover");
    await sleep(350);
    await run({ op: "navigate", route: "/studio/music" });
    await sleep(250);
    await run({ op: "command", name: "music.clear", args: {} });
    await run({ op: "highlight", target: "music.tempo", note: "Setting the tempo to 124 BPM" });
    await run({ op: "type", target: "music.tempo", text: "124" });
    for (const [track, steps] of Object.entries(BEAT)) {
      caption(`programming ${track}`);
      for (const s of steps) await run({ op: "click", target: `music.step.${track}.${s}` });
    }
    await run({ op: "command", name: "music.setPattern", args: { track: "clap", steps: "....x.......x..x" } });
    await run({ op: "command", name: "synth.set", args: { param: "cutoff", value: 2400 } });
    caption("");
    await run({ op: "click", target: "music.play" });
    await sleep(2600);
    await run({ op: "click", target: "music.stop" });
    await run({ op: "navigate", route: "/studio/photo" });
    await sleep(300);
    await run({ op: "command", name: "photo.demoImage", args: {} });
    await run({ op: "highlight", target: "photo.presets", note: "Applying a cinematic filter" });
    await run({ op: "click", target: "photo.preset.teal-orange" });
    await run({ op: "command", name: "photo.filter", args: { name: "vignette", amount: 0.7 } });
    await sleep(700);
    await run({ op: "takeover_end" });
    toast("Demo takeover finished — this is how Lumen drives the studios.", "ok");
  } catch (e) {
    if (!(e instanceof TookOver)) {
      toast(`Demo stopped: ${(e as Error).message}`, "warn");
      try { await execOp(op({ op: "takeover_end" })); } catch { /* */ }
    } else toast("You took back control.", "info");
  } finally {
    agent.setStatus("idle");
    running = false;
  }
}
