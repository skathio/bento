---
name: visual-check
description: Build Bento, serve the built site, and screenshot it at phone and desktop widths in light and dark mode. Use for every change that affects what renders (components, styles, index.html, icons, displayed text or numbers) before opening or updating a PR.
---

# Visual check

Check the **built** site: the CSP is injected only by the build, so `npm run dev` can hide breakage.
Tooling is the Playwright MCP server (`mcp__playwright__*`); load its tools with ToolSearch. No new
dependency is needed.

## 1. Build and serve

```sh
PORT=4173
npm run build && mkdir -p .playwright-mcp && rm -f .playwright-mcp/preview.pid
node_modules/.bin/vite preview --config vite.config.ts --port "$PORT" --strictPort > .playwright-mcp/preview.log 2>&1 &
PID=$!
for i in $(seq 30); do grep -qE 'Local:|in use' .playwright-mcp/preview.log && break; sleep 0.5; done
if grep -q 'Local:' .playwright-mcp/preview.log && kill -0 "$PID" 2>/dev/null; then
  echo "$PID" > .playwright-mcp/preview.pid
  curl -s "http://localhost:$PORT/" | grep -cE 'Content-Security-Policy|<title>Bento'   # expect 2: the CSP meta and Bento's title
else
  echo "preview did not start (port $PORT taken?):"; cat .playwright-mcp/preview.log
fi
```

Run it in one shell call. `--strictPort` makes Vite exit rather than move to another port, so a
busy port shows up as "did not start": pick another `PORT` and use it below. The PID file is
written only for a server that started.

## 2. Screenshot four views

Screenshots must be saved inside the repo; use `.playwright-mcp/` (gitignored). For each of
phone `390x844` and desktop `1280x800`, and each scheme `light` and `dark`:

1. `browser_resize` to the width and height.
2. `browser_emulate_media` with `colorScheme`. The theme toggle defaults to Auto, which follows it.
3. `browser_navigate` to `http://localhost:$PORT/` (default 4173; navigate again after changing state).
4. `browser_take_screenshot` with `fullPage: true`, `scale: "css"`,
   `filename: ".playwright-mcp/<phone|desktop>-<light|dark>.png"`.

Then `browser_console_messages` at level `warning`: expect no errors, in particular no CSP
violations.

If the change lives behind state (More options open, Run selected, a custom pack, a hot day), click
or fill your way there with `browser_snapshot` + `browser_click` / `browser_type` and screenshot that
state as well. To pin a theme instead of following the OS, click the theme toggle
(`Theme: … Switch theme`), which stores `bento.theme` in localStorage.

## 3. Inspect

Open every PNG with Read and look at it: no horizontal overflow at 390 px, readable contrast in both
schemes, nothing clipped or overlapping, the changed area looks as intended, and the
not-medical-advice footer is still there.

## 4. Report and clean up

- Describe what each screenshot shows in the PR (or attach them in a PR comment). Do not commit them.
- Close the browser (`browser_close`) and stop the preview server by its PID:
  `kill "$(cat .playwright-mcp/preview.pid)" && rm .playwright-mcp/preview.pid`. Do not kill by port,
  which can hit another server, or with `pkill -f` on its command line, which can match your own shell.
