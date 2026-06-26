// Builds a self-contained static site into ./dist — deployable to any static
// host (Vercel, Netlify, GitHub Pages, S3, …). Zero dependencies.
//
//   node playground/build.mjs            # → ./dist
//   node playground/serve.mjs dist       # preview the built site
//
// The output mirrors the repo's relative layout so the playground's own
// `../compiler/src/*.js` imports and `../examples/*.px` fetches resolve with no
// path rewriting:
//
//   dist/index.html                 landing page
//   dist/playground/                the IDE (index.html, styles.css, playground.js)
//   dist/compiler/src/*.js          the browser-safe compiler + runtime
//   dist/compiler/examples/*.px     example sources referenced by the IDE
//   dist/examples/**/*.px

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DIST = resolve(ROOT, "dist");

const SITE = "https://franklin-b.github.io/pecanx";
const DESC = "PecanX compiles pure logic to one shared WebAssembly Kernel that runs identically on client and server, and interface code to JavaScript — making null, unhandled errors, impossible UI states, and client/server drift unrepresentable.";

// Browser-safe compiler modules the playground imports (must stay Node-global free).
const SRC_MODULES = ["lexer", "parser", "check", "types", "codegen", "wasm", "format", "runtime"];

function copy(relPath) {
  const from = resolve(ROOT, relPath);
  if (!existsSync(from)) throw new Error(`build: missing ${relPath}`);
  const to = join(DIST, relPath);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
  return relPath;
}

// Discover the example `.px` files the playground loads on demand, from the
// `path:` entries in its EXAMPLES list — so new examples are bundled automatically.
function discoverExamplePaths() {
  const js = readFileSync(resolve(ROOT, "playground/playground.js"), "utf8");
  const out = [];
  for (const m of js.matchAll(/path:\s*"([^"]+)"/g)) {
    // paths are relative to the playground/ dir; normalize to a repo-root path
    out.push(relative(ROOT, resolve(ROOT, "playground", m[1])).replace(/\\/g, "/"));
  }
  return [...new Set(out)];
}

function landingHtml(ogImage) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PecanX — a correctness-first language for the web</title>
    <meta name="description" content="${DESC}" />
    <link rel="canonical" href="${SITE}/" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${SITE}/" />
    <meta property="og:title" content="PecanX — a correctness-first language for the web" />
    <meta property="og:description" content="${DESC}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="PecanX — a correctness-first language for the web" />
    <meta name="twitter:description" content="${DESC}" />${ogImage ? `
    <meta property="og:image" content="${ogImage}" />
    <meta name="twitter:image" content="${ogImage}" />` : ""}
    <style>
      :root { --bg:#0e1014; --bg2:#14171d; --panel:#11141a; --border:#262b35; --fg:#e6e8ec; --dim:#9aa3b2; --muted:#6b7385; --accent:#c98a3a; --accent2:#e0a965; --ok:#5bbf86; --ctor:#69c6c0; --type:#6cb6e6; }
      * { box-sizing: border-box; }
      html, body { margin: 0; }
      body { background: radial-gradient(1200px 600px at 50% -200px, #1b2030, var(--bg)) fixed; color: var(--fg); font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      .wrap { max-width: 880px; margin: 0 auto; padding: 0 22px; }
      header { padding: 64px 0 8px; text-align: center; }
      .logo { color: var(--accent); font-size: 46px; line-height: 1; }
      h1 { font-size: 40px; margin: 14px 0 6px; letter-spacing: -.5px; }
      .tag { color: var(--dim); font-size: 19px; max-width: 640px; margin: 0 auto; }
      .cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin: 30px 0 8px; }
      .btn { font: inherit; font-size: 15px; text-decoration: none; padding: 11px 20px; border-radius: 9px; border: 1px solid var(--border); color: var(--fg); background: var(--bg2); }
      .btn:hover { border-color: #39414f; }
      .btn.primary { background: var(--accent); border-color: var(--accent); color: #1a1206; font-weight: 650; }
      .btn.primary:hover { background: var(--accent2); border-color: var(--accent2); }
      section { margin: 46px 0; }
      h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1.4px; color: var(--muted); margin: 0 0 16px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      @media (max-width: 620px) { .grid { grid-template-columns: 1fr; } }
      .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
      .card h3 { margin: 0 0 6px; font-size: 15px; }
      .card p { margin: 0; color: var(--dim); font-size: 14px; }
      .card code { color: var(--ctor); }
      pre { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; overflow: auto; font: 13px/1.6 ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #cdd3dd; }
      .kw { color: var(--accent); } .ty { color: var(--type); } .ct { color: var(--ctor); } .st { color: #9ece8a; } .cm { color: var(--muted); font-style: italic; }
      footer { color: var(--muted); font-size: 13px; text-align: center; padding: 30px 0 60px; }
      footer a { color: var(--dim); }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <div class="logo">◗</div>
        <h1>PecanX</h1>
        <p class="tag">A correctness-first language for full-stack web apps. Pure logic compiles to one shared
          <b>WebAssembly Kernel</b> that runs identically on client and server; interface code compiles to JavaScript.</p>
        <div class="cta">
          <a class="btn primary" href="./playground/">Open the Playground →</a>
          <a class="btn" href="https://github.com/Franklin-B/pecanx">Source &amp; docs</a>
        </div>
      </header>

      <section>
        <h2>Four bug families, made unrepresentable</h2>
        <div class="grid">
          <div class="card"><h3>No null</h3><p>There is no <code>null</code>/<code>undefined</code>. Absence is <code>Option&lt;a&gt;</code>, and you must handle it.</p></div>
          <div class="card"><h3>No exceptions</h3><p>Fallible work returns <code>Result&lt;e, a&gt;</code>. The <code>?</code> operator threads the happy path.</p></div>
          <div class="card"><h3>No impossible states</h3><p>Sum types + <b>exhaustive</b> <code>match</code>. A missing case is a compile error (PX0001).</p></div>
          <div class="card"><h3>No client/server drift</h3><p>One shared Kernel validates both sides — the same code, compiled to JS and Wasm.</p></div>
        </div>
      </section>

      <section>
        <h2>A taste</h2>
        <pre><span class="cm">-- the happy path reads as a straight line; any Err short-circuits.</span>
<span class="kw">fn</span> mkForm(name: <span class="ty">String</span>, age: <span class="ty">String</span>): <span class="ty">Result</span>&lt;<span class="ty">String</span>, <span class="ty">Form</span>&gt; =
  <span class="kw">let</span> n = nonEmpty(name)?
  <span class="kw">let</span> a = positiveAge(age)?
  <span class="ct">Ok</span>({ name = n, age = a })</pre>
      </section>

      <section>
        <h2>Get started</h2>
        <pre><span class="cm"># scaffold, run, test, and serve a live app</span>
pcx new myapp
cd myapp
pcx test
pcx dev Main.px</pre>
      </section>

      <footer>
        Built with <code>pcx</code> v0.4. The playground runs the real compiler entirely in your browser.
        · <a href="./playground/">Playground</a>
        · <a href="https://github.com/Franklin-B/pecanx">GitHub</a>
      </footer>
    </div>
  </body>
</html>
`;
}

function main() {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  const copied = [];
  // the IDE
  for (const f of ["playground/index.html", "playground/styles.css", "playground/playground.js"]) copied.push(copy(f));
  // the browser-safe compiler + runtime
  for (const m of SRC_MODULES) copied.push(copy(`compiler/src/${m}.js`));
  // example sources the IDE loads on demand
  for (const p of discoverExamplePaths()) copied.push(copy(p));
  // social card: host the SVG at the site root; reference a rasterized PNG for
  // og:image only when one exists (see scripts/make-social.js), so the card is
  // never broken.
  let ogImage = null;
  const svgSrc = resolve(ROOT, ".github/social-preview.svg");
  if (existsSync(svgSrc)) cpSync(svgSrc, join(DIST, "social-preview.svg"));
  const pngSrc = resolve(ROOT, ".github/social-preview.png");
  if (existsSync(pngSrc)) { cpSync(pngSrc, join(DIST, "social-preview.png")); ogImage = `${SITE}/social-preview.png`; }
  // landing page
  writeFileSync(join(DIST, "index.html"), landingHtml(ogImage));

  console.log(`✓ built dist/ (${copied.length + 1} files)`);
  console.log(`  landing:    dist/index.html`);
  console.log(`  playground: dist/playground/`);
  console.log(`  examples:   ${discoverExamplePaths().length} bundled`);
  console.log(`\npreview it:  node playground/serve.mjs dist   → http://localhost:5173/`);
}

main();
