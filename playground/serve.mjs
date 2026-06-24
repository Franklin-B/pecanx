// Tiny static file server for the PecanX playground.
//
//   node playground/serve.mjs        # then open http://localhost:5173/playground/
//
// It serves the repo root (so the page's `../compiler/src/*.js` imports and
// `../examples/*.px` fetches resolve) with the right MIME types. Zero deps.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const PORT = Number(process.env.PORT || 5173);
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
    if (p === "/") { res.writeHead(302, { Location: "/playground/" }); res.end(); return; }
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
