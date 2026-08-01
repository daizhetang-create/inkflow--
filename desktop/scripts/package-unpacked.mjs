import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rcedit } from "rcedit";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..", "..");
const electronDistribution = resolve(projectRoot, "node_modules", "electron", "dist");
const releaseRoot = resolve(projectRoot, "release");
const appDirectory = resolve(releaseRoot, "win-unpacked");
const resourcesApp = resolve(appDirectory, "resources", "app");
const desktopSource = resolve(projectRoot, "desktop");
const executable = resolve(appDirectory, "墨流.exe");
const packageData = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));

if (relative(releaseRoot, appDirectory).startsWith("..") || appDirectory === releaseRoot) {
  throw new Error("Unsafe release target");
}

await rm(appDirectory, { recursive: true, force: true });
await mkdir(releaseRoot, { recursive: true });
await cp(electronDistribution, appDirectory, { recursive: true });
await rename(resolve(appDirectory, "electron.exe"), executable);
await rm(resolve(appDirectory, "resources", "default_app.asar"), { force: true });
await mkdir(resolve(resourcesApp, "desktop"), { recursive: true });

await Promise.all([
  cp(resolve(desktopSource, "main.cjs"), resolve(resourcesApp, "desktop", "main.cjs")),
  cp(resolve(desktopSource, "preload.cjs"), resolve(resourcesApp, "desktop", "preload.cjs")),
  cp(resolve(desktopSource, "dist"), resolve(resourcesApp, "desktop", "dist"), { recursive: true }),
  cp(resolve(desktopSource, "assets"), resolve(resourcesApp, "desktop", "assets"), { recursive: true }),
]);

await writeFile(resolve(resourcesApp, "package.json"), JSON.stringify({
  name: packageData.name,
  productName: "墨流",
  version: packageData.version,
  description: packageData.description,
  main: "desktop/main.cjs",
  type: "module",
}, null, 2));

await rcedit(executable, {
  icon: resolve(desktopSource, "assets", "icon.ico"),
  "file-version": packageData.version,
  "product-version": packageData.version,
  "version-string": {
    CompanyName: "墨流",
    FileDescription: "墨流个人日常助手",
    LegalCopyright: `Copyright © ${new Date().getFullYear()} 墨流`,
    OriginalFilename: "墨流.exe",
    ProductName: "墨流",
  },
});

process.stdout.write(executable);
