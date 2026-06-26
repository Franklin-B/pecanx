// Tiny static file server for the PecanX playground. Zero deps.
//
//   node playground/serve.mjs        # repo root → http://localhost:5173/playground/
//   node playground/serve.mjs dist   # the built site → http://localhost:5173/
//
// Serving the repo root lets the page's `../compiler/src/*.js` imports and
// `../examples/*.px` fetches resolve; serving a built `dist/` (which carries its
// own landing index.html and mirrored layout) works the same way.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const ROOT = process.argv[2] ? resolve(process.argv[2]) : REPO_ROOT;
const PORT = Number(process.env.PORT || 5173);

async function hasFile(p) { try { return (await stat(p)).isFile(); } catch { return false; } }
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".px": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    // `/` serves a root landing page if one exists (the built dist/), else sends
    // you to the playground (serving the repo root in dev).
    if (p === "/") p = (await hasFile(join(ROOT, "index.html"))) ? "/index.html" : "/playground/";
    if (p.endsWith("/")) p += "index.html";
    const fp = join(ROOT, p);
    if (fp !== ROOT && !fp.startsWith(ROOT + sep)) { res.writeHead(403); res.end("forbidden"); return; }
    const data = await readFile(fp);
    res.writeHead(200, { "Content-Type": MIME[extname(fp).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  }
}).listen(PORT, () => {
  console.log(`PecanX playground → http://localhost:${PORT}/playground/`);
});
