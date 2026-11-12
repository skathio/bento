#!/usr/bin/env node
// =============================================================================
// Build the site: Vite bundles the React app (and the icons index.html links)
// from site/ into dist/. Bento has no data payload to copy or check.
//
//   node tools/build.ts
// =============================================================================
import { build } from "vite";

await build({ configFile: "vite.config.ts", logLevel: "warn" });
console.log("build: dist/");
