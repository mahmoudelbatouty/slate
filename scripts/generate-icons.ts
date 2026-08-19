/**
 * Renders the Slate mark into the app icons Next serves from `src/app`.
 *
 *   npx tsx scripts/generate-icons.ts
 *
 * The mark itself lives in `src/components/SlateMark.tsx` as four grid cells,
 * so it has no asset to export — this redraws the same shape from the same
 * Floodlight tokens. Re-run it when those tokens move.
 *
 * The proportions here are deliberately not the component's. SlateMark pads by
 * 20% of the box, which is right at 17px in a header but leaves a 16px favicon
 * mostly empty; a tab icon has to fill its frame. Padding is tightened and the
 * hairline border dropped, since a 1px stroke at 16px is aliasing, not detail.
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const INK_RAISED = "#171f26";
const AMBER = "#f2a33c";
// --mark-off is #39454f, which sits ~1.3:1 against the raised ground — fine at
// 17px beside lit amber, invisible at 16px in a tab. Lifted just far enough that
// the four-square shape survives; the mark still reads as one lit, three inert.
const MARK_OFF = "#4a5a66";

// Proportions as a fraction of the icon's edge.
const GROUND_RADIUS = 0.22;
const PAD = 0.125;
const GAP = 0.08;
const SQUARE = (1 - PAD * 2 - GAP) / 2;
const SQUARE_RADIUS = 0.14;

export function markSvg(size: number, lit = true): string {
  const pad = size * PAD;
  const gap = size * GAP;
  const square = size * SQUARE;
  const cell = (index: number) => ({
    x: pad + (index % 2) * (square + gap),
    y: pad + Math.floor(index / 2) * (square + gap),
  });
  const squares = [0, 1, 2, 3]
    .map((index) => {
      const { x, y } = cell(index);
      const fill = index === 0 && lit ? AMBER : MARK_OFF;
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${square.toFixed(2)}" height="${square.toFixed(2)}" rx="${(square * SQUARE_RADIUS).toFixed(2)}" fill="${fill}"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${(size * GROUND_RADIUS).toFixed(2)}" fill="${INK_RAISED}"/>${squares}</svg>`;
}

async function png(size: number): Promise<Buffer> {
  return sharp(Buffer.from(markSvg(size))).png({ compressionLevel: 9 }).toBuffer();
}

/** ICO container holding PNG frames — every browser Slate targets reads them. */
function ico(frames: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  let offset = 6 + frames.length * 16;
  const entries: Buffer[] = [];
  for (const frame of frames) {
    const entry = Buffer.alloc(16);
    entry[0] = frame.size >= 256 ? 0 : frame.size;
    entry[1] = frame.size >= 256 ? 0 : frame.size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(frame.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += frame.data.length;
  }

  return Buffer.concat([header, ...entries, ...frames.map((f) => f.data)]);
}

async function main() {
  const sizes = [16, 32, 48];
  const frames = await Promise.all(sizes.map(async (size) => ({ size, data: await png(size) })));
  writeFileSync("src/app/favicon.ico", ico(frames));

  // Scalable icon: browsers that support it never touch the .ico rasters.
  writeFileSync("src/app/icon.svg", markSvg(512));

  // iOS home screen. No transparency, no rounding of its own — iOS masks it.
  writeFileSync("src/app/apple-icon.png", await png(180));

  console.log(`favicon.ico   ${sizes.join("/")} px, ${(ico(frames).length / 1024).toFixed(1)}KB`);
  console.log("icon.svg      scalable");
  console.log("apple-icon.png 180px");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
