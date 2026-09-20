import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `public/` holds the committed geometry (geo/) and, from T3, the data bundle
// (data/). Vite serves that directory verbatim at the site root, which is why
// the app needs no loader plumbing: every fetch is a plain path.
export default defineConfig({
  plugins: [react()],
  // A GitHub Pages PROJECT site is served from /<repo>/, not the root, so every
  // asset URL needs that prefix. An env var rather than a constant because the
  // same build has to work at "/" for the dev server and at "/<repo>/" for the
  // published site; the CI workflow sets it from the repository name.
  base: process.env.VITE_BASE || "/",
  build: { chunkSizeWarningLimit: 1200 },
});
