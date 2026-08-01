import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..", "..");
const source = resolve(projectRoot, "public", "favicon.svg");
const outputDirectory = resolve(projectRoot, "desktop", "assets");
const svg = await readFile(source);

await mkdir(outputDirectory, { recursive: true });
const iconSizes = [16, 24, 32, 48, 64, 128, 256];
const iconBuffers = await Promise.all(iconSizes.map((size) => sharp(svg).resize(size, size).png().toBuffer()));
await writeFile(resolve(outputDirectory, "icon.png"), iconBuffers.at(-1));
await writeFile(resolve(outputDirectory, "tray.png"), await sharp(svg).resize(32, 32).png().toBuffer());
await writeFile(resolve(outputDirectory, "icon.ico"), await pngToIco(iconBuffers));
