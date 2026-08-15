/**
 * Generate the PWA/favicon PNG set from public/icon.svg using sharp.
 * Run: pnpm gen:icons  (already committed outputs; re-run only if the logo changes)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
const pub = resolve(process.cwd(), "public");
const svg = readFileSync(resolve(pub, "icon.svg"));
// Maskable icon needs safe padding: render the mark smaller on a full bg square.
const maskableSvg =
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
     <rect width="512" height="512" fill="#0b0c0e"/>
     <g transform="translate(64 64) scale(0.75)">${readFileSync(resolve(pub, "icon.svg"), "utf8").replace(/<\?xml.*?\?>/, "")}</g>
   </svg>`);
async function main() {
  await sharp(svg).resize(192, 192).png().toFile(resolve(pub, "icon-192.png"));
  await sharp(svg).resize(512, 512).png().toFile(resolve(pub, "icon-512.png"));
  await sharp(svg)
    .resize(180, 180)
    .png()
    .toFile(resolve(pub, "icon-apple.png"));
  await sharp(maskableSvg)
    .resize(512, 512)
    .png()
    .toFile(resolve(pub, "icon-maskable.png"));
  await sharp(svg).resize(32, 32).png().toFile(resolve(pub, "favicon.png"));
  console.log("Generated icon set in public/.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
