import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Exact allowlist of local MediaPipe JS loaders.
// Maps exact pathnames to absolute files in public/ to prevent broad filesystem access or path traversal.
const MEDIAPIPE_JS_LOADERS: Record<string, string> = {
  "/assets/mediapipe/wasm/vision_wasm_internal.js": path.resolve(
    __dirname,
    "public/assets/mediapipe/wasm/vision_wasm_internal.js",
  ),
  "/assets/mediapipe/wasm/vision_wasm_module_internal.js": path.resolve(
    __dirname,
    "public/assets/mediapipe/wasm/vision_wasm_module_internal.js",
  ),
  "/assets/mediapipe/wasm/vision_wasm_nosimd_internal.js": path.resolve(
    __dirname,
    "public/assets/mediapipe/wasm/vision_wasm_nosimd_internal.js",
  ),
};

function mediapipeDevPlugin(): Plugin {
  return {
    name: "mediapipe-dev-loader",
    apply: "serve", // Dev server only; production preview and build remain completely unchanged
    configureServer(server) {
      // Register before Vite's internal transform middleware so dynamic imports to public JS assets are served directly
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        let pathname: string;
        try {
          pathname = new URL(req.url, "http://127.0.0.1").pathname;
        } catch {
          return next();
        }

        const filePath = MEDIAPIPE_JS_LOADERS[pathname];
        if (!filePath) return next();

        if (req.method !== "GET" && req.method !== "HEAD") {
          res.statusCode = 405;
          res.setHeader("Allow", "GET, HEAD");
          res.end();
          return;
        }

        try {
          const stat = fs.statSync(filePath);
          const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
          res.setHeader("Content-Type", "application/javascript; charset=utf-8");
          res.setHeader("Content-Length", stat.size.toString());
          res.setHeader("ETag", etag);
          res.setHeader("Last-Modified", stat.mtime.toUTCString());
          res.setHeader("Cache-Control", "no-cache");

          if (req.headers["if-none-match"] === etag) {
            res.statusCode = 304;
            res.end();
            return;
          }

          if (req.method === "HEAD") {
            res.statusCode = 200;
            res.end();
            return;
          }

          res.statusCode = 200;
          fs.createReadStream(filePath).pipe(res);
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), mediapipeDevPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
});
