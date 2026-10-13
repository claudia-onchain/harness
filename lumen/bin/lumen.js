#!/usr/bin/env node
// Lumen CLI entry.
const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  process.stderr.write(`Lumen needs Node.js 22 or newer (you have ${process.versions.node}). Get it at https://nodejs.org\n`);
  process.exit(1);
}
// Piping into `head` etc. closes stdout early: exit quietly instead of crashing on EPIPE.
for (const s of [process.stdout, process.stderr]) s.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); throw e; });
const { main, onFatal } = await import("../src/cli/index.js");
main().catch(onFatal);
