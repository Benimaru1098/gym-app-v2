import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const publicDir = new URL("./public/", import.meta.url);
const publicOfflineFiles = [
  "manifest.webmanifest",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
];
const buildPlaceholder = "/* PWA_BUILD */ null";

function precacheEntry(url, content, revalidate = false) {
  return {
    url,
    integrity: `sha256-${createHash("sha256").update(content).digest("base64")}`,
    revalidate,
  };
}

function offlineCachePlugin() {
  return {
    name: "gym-cycle-offline-cache",
    apply: "build",
    generateBundle: {
      order: "post",
      async handler(_, bundle) {
        if (bundle["index.html"]?.type !== "asset") {
          this.error("Missing index.html for the offline build.");
        }

        const files = Object.values(bundle)
          .filter((file) => file.type === "chunk" || file.fileName === "index.html" ||
            (file.fileName.startsWith("assets/") && !file.fileName.endsWith(".map")))
          .map((file) => {
            const isIndex = file.fileName === "index.html";
            return precacheEntry(
              isIndex ? "./" : file.fileName,
              file.type === "chunk" ? file.code : file.source,
              isIndex,
            );
          });

        const publicEntries = await Promise.all(publicOfflineFiles.map(async (file) =>
          precacheEntry(file, await readFile(new URL(file, publicDir)), true),
        ));
        files.push(...publicEntries);
        files.sort((first, second) => first.url.localeCompare(second.url, "en"));

        const worker = await readFile(new URL("sw.js", publicDir), "utf8");
        if (!worker.includes(buildPlaceholder)) {
          this.error("Missing offline build placeholder in public/sw.js.");
        }
        const revision = createHash("sha256")
          .update(worker)
          .update(JSON.stringify(files))
          .digest("hex")
          .slice(0, 16);
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: worker.replace(buildPlaceholder, () => JSON.stringify({ revision, files }, null, 2)),
        });
      },
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), offlineCachePlugin()],
  build: {
    assetsDir: "assets",
  },
});
