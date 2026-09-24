import { createReadStream, existsSync, mkdirSync, readFileSync, copyFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const WEB = dirname(fileURLToPath(import.meta.url));
/** The pipeline's published outputs. The site reads them from here. */
const PUBLISHED = join(WEB, "..", "data");
/** What the bundle stage generated, including the list of files that ship. */
const META = join(WEB, "public", "data", "meta.json");

/**
 * The pipeline's data/ directory, served at /data/ and shipped in the build.
 *
 * WHY THIS EXISTS
 *
 * Vite serves ONE public directory, so the published datasets used to be
 * copied into web/public/data/ by the bundle stage — and both copies were
 * committed: 4.5 MB of a 13.9 MB repository was the same JSON twice. This
 * serves the originals instead.
 *
 * Only what meta.json's `files` lists is served or shipped, which is the list
 * atlas/export/bundle.py declares: a dataset the site does not read never
 * reaches it, and the raw HTTP cache under data/raw/ is unreachable by
 * construction rather than by a rule someone has to remember. A generated file
 * (meta.json itself, the palette, the election index) is not in data/ and
 * falls through to public/ as before.
 */
function publishedData(): Plugin {
  const served = (): Set<string> => {
    if (!existsSync(META)) return new Set();
    const meta = JSON.parse(readFileSync(META, "utf8")) as { files?: string[] };
    return new Set(meta.files ?? []);
  };
  let outDir = "dist";

  return {
    name: "published-data",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const base = server.config.base.replace(/\/$/, "");
        const url = (request.url ?? "").split("?")[0];
        if (!url.startsWith(`${base}/data/`)) return next();
        const rel = normalize(decodeURIComponent(url.slice(base.length + "/data/".length)))
          .replace(/\\/g, "/");
        const file = join(PUBLISHED, rel);
        // Listed, inside data/, and a file — anything else is public/'s to answer.
        if (!served().has(rel) || relative(PUBLISHED, file).startsWith("..")
            || !existsSync(file) || !statSync(file).isFile()) {
          return next();
        }
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        createReadStream(file).pipe(response);
      });
    },
    closeBundle() {
      const target = join(WEB, outDir, "data");
      for (const rel of served()) {
        const file = join(PUBLISHED, rel);
        if (!existsSync(file)) continue;
        mkdirSync(dirname(join(target, rel)), { recursive: true });
        copyFileSync(file, join(target, rel));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), publishedData()],
  // A GitHub Pages PROJECT site is served from /<repo>/, not the root, so every
  // asset URL needs that prefix. An env var rather than a constant because the
  // same build has to work at "/" for the dev server and at "/<repo>/" for the
  // published site; the CI workflow sets it from the repository name.
  base: process.env.VITE_BASE || "/",
  build: { chunkSizeWarningLimit: 1200 },
});
