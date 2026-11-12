import { strict as assert } from "node:assert";
import { test } from "node:test";

import { CSP, csp } from "../vite.config.ts";

test("the CSP is added to the built page only, never the dev server", () => {
  const plugin = csp();
  assert.equal(plugin.apply, "build");
  const transform = plugin.transformIndexHtml as () => { tag: string; attrs: Record<string, string> }[];
  assert.deepEqual(transform()[0]?.attrs, { "http-equiv": "Content-Security-Policy", content: CSP });
  assert.match(CSP, /script-src 'self';/);
  assert.match(CSP, /style-src 'self';/);
});
