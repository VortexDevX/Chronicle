import sharp from "sharp";
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const master = path.join(root, "design/brand/chronicle-master.png");
const background = "#0d141a";
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const mark = await sharp(master).trim().png().toBuffer();

async function icon(size, coverage, fill = background, monochrome = false) {
  const edge = Math.round(size * coverage);
  let image = await sharp(mark).resize(edge, edge, { fit: "contain", background: transparent }).png().toBuffer();
  if (monochrome) {
    const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = 255;
    image = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  }
  return sharp({ create: { width: size, height: size, channels: 4, background: fill } })
    .composite([{ input: image, gravity: "centre" }]).png({ compressionLevel: 9 }).toBuffer();
}

async function save(relative, contents) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

await save("public/brand/chronicle-mark.png", await icon(512, .94, transparent));
await save("public/icon.png", await icon(512, .72));
await save("public/icon-maskable.png", await icon(512, .60));
await save("public/favicon.png", await icon(192, .76));
await save("public/apple-touch-icon.png", await icon(180, .70));

// PNG-backed ICO entries retain crisp alpha at each actual browser size.
const sizes = [16, 32, 48];
const bitmaps = await Promise.all(sizes.map(size => icon(size, .82)));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, index) => {
  const entry = 6 + index * 16;
  header[entry] = size;
  header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(bitmaps[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += bitmaps[index].length;
});
await save("public/favicon.ico", Buffer.concat([header, ...bitmaps]));

// Native source remains intentionally local; web-only checkouts need no Android SDK.
const android = "android-app/app/src/main/res";
let nativePresent = false;
try { await access(path.join(root, android)); nativePresent = true; } catch {}
if (nativePresent) {
  for (const [density, scale] of [["mdpi", 1], ["hdpi", 1.5], ["xhdpi", 2], ["xxhdpi", 3], ["xxxhdpi", 4]]) {
    const launcher = await icon(Math.round(48 * scale), .72);
    await save(`${android}/mipmap-${density}/ic_launcher.png`, launcher);
    await save(`${android}/mipmap-${density}/ic_launcher_round.png`, launcher);
    // This mark's full silhouette fits inside the central 66 dp circle, not just its bounding square.
    await save(`${android}/mipmap-${density}/ic_launcher_foreground.png`, await icon(Math.round(108 * scale), .50, transparent));
    await save(`${android}/mipmap-${density}/ic_launcher_monochrome.png`, await icon(Math.round(108 * scale), .50, transparent, true));
  }
}
console.log(`Exported web icons${nativePresent ? " and Android launcher densities" : ""}.`);
