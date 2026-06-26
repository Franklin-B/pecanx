// Rasterize the social-preview card (.github/social-preview.svg) to a 1280×640
// PNG that GitHub's "Social preview" and link unfurlers (X, Slack, Discord, …)
// can use. The repo ships only the SVG; this produces the PNG on demand.
//
//   node scripts/make-social.js
//
// It uses @resvg/resvg-js or sharp if either is installed (neither is a project
// dependency). If neither is present it prints how to finish the job by hand —
// the SVG opens in any browser and exports to PNG.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SVG = resolve(HERE, "..", ".github", "social-preview.svg");
const PNG = resolve(HERE, "..", ".github", "social-preview.png");
const W = 1280, H = 640;

const svg = readFileSync(SVG);

async function render() {
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
    writeFileSync(PNG, png);
    return "@resvg/resvg-js";
  } catch {}
  try {
    const sharp = (await import("sharp")).default;
    await sharp(svg, { density: 192 }).resize(W, H).png().toFile(PNG);
    return "sharp";
  } catch {}
  return null;
}

const via = await render();
if (via) {
  console.log(`✓ wrote .github/social-preview.png (${W}×${H}) via ${via}`);
  console.log("  • next build copies it to dist/ and emits the og:image/twitter:image tags");
  console.log("  • upload it at GitHub → Settings → General → Social preview for the repo card");
} else {
  console.log("No SVG rasterizer found. Finish the PNG one of these ways:\n");
  console.log("  a) npm i -D @resvg/resvg-js   then re-run:  node scripts/make-social.js");
  console.log("  b) open .github/social-preview.svg in a browser and export/screenshot");
  console.log("     a 1280×640 PNG to .github/social-preview.png\n");
  console.log("Then `npm run build` (the live site picks it up) and upload it at");
  console.log("GitHub → Settings → General → Social preview.");
  process.exitCode = 1;
}
