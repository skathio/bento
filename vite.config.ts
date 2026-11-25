// Vite builds the React app from site/ into dist/. Everything is static: GitHub
// Pages serves it under /bento/, hence the relative base.
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

/** The page's Content-Security-Policy: no inline script or style, no third parties. Fonts come
 *  from the site's own files only (the bundled typeface), so font-src needs no data:. */
export const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'";

// Added to the built page only: the dev server injects inline styles and the
// React refresh script, which this policy would block.
export const csp = (): Plugin => ({
  name: "bento-csp",
  apply: "build",
  transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" }],
});

export default defineConfig({
  root: "site",
  base: "./", // GitHub Pages serves under /bento/
  publicDir: false,
  plugins: [csp(), react(), tailwindcss()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    // Never inline a font as a data: URI, which font-src 'self' blocks; emit it as a file.
    assetsInlineLimit: (file) => (file.endsWith(".woff2") ? false : undefined),
  },
});
