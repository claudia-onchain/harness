#!/usr/bin/env node
// Pulse CLI entry.
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  process.stderr.write(`Pulse needs Node.js 22.13 or newer (you have ${process.versions.node}): node:sqlite, fetch and WebSocket are built in there. https://nodejs.org\n`);
  process.exit(1);
}
// node:sqlite still prints an ExperimentalWarning on some 22.x/24.x builds; it is the one experimental API we rely on.
const emit = process.emitWarning;
process.emitWarning = (w, ...rest) => {
  const type = typeof rest[0] === "string" ? rest[0] : rest[0]?.type;
  if (type === "ExperimentalWarning" && /sqlite/i.test(String(w?.message || w))) return;
  return emit.call(process, w, ...rest);
};
// Piping into `head` etc. closes stdout early: exit quietly instead of crashing on EPIPE.
for (const s of [process.stdout, process.stderr]) s.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); throw e; });
const { main, onFatal } = await import("../src/cli/index.js");
main().catch(onFatal);
