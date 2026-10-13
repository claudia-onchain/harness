import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const FFMPEG_DIR = join(root, "node_modules/@ffmpeg/core/dist/esm");
const FFMPEG_FILES = ["ffmpeg-core.js", "ffmpeg-core.wasm"];

/** Serves @ffmpeg/core from node_modules at /ffmpeg/* in dev and copies it to dist/ffmpeg/ on build (no CDN). */
function ffmpegCore(): Plugin {
  return {
    name: "lumen-ffmpeg-core",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/ffmpeg\/(ffmpeg-core\.(?:js|wasm))(?:\?.*)?$/.exec(req.url ?? "");
        if (!m) return next();
        const file = join(FFMPEG_DIR, m[1]);
        if (!existsSync(file)) return next();
        res.setHeader("Content-Type", m[1].endsWith(".wasm") ? "application/wasm" : "text/javascript");
        res.setHeader("Content-Length", String(statSync(file).size));
        createReadStream(file).pipe(res);
      });
    },
    writeBundle(opts) {
      const out = join(opts.dir ?? join(root, "dist"), "ffmpeg");
      mkdirSync(out, { recursive: true });
      for (const f of FFMPEG_FILES) if (existsSync(join(FFMPEG_DIR, f))) copyFileSync(join(FFMPEG_DIR, f), join(out, f));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "");
  const port = Number(env.LUMEN_PORT || process.env.LUMEN_PORT || 4747);
  const target = `http://127.0.0.1:${port}`;
  const token = env.VITE_LUMEN_TOKEN || "";
  // The server only answers its own Host/Origin, so the dev proxy presents itself as the app.
  const headers: Record<string, string> = { origin: target, ...(token ? { "x-lumen-token": token } : {}) };
  return {
    root,
    base: "/",
    plugins: [react(), ffmpegCore()],
    optimizeDeps: { exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"] },
    worker: { format: "es" },
    build: { outDir: "dist", emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 1600, target: "es2022" },
    server: {
      host: "127.0.0.1",
      // the chain registry is shared with the CLI (../src/chains/registry.js)
      fs: { allow: [root, join(root, "../src/chains")] },
      port: 5174,
      proxy: {
        "/api": { target, changeOrigin: true, headers },
        "/ws": { target: target.replace("http", "ws"), ws: true, changeOrigin: true, headers },
      },
    },
    preview: { host: "127.0.0.1", port: 5175 },
  };
});
