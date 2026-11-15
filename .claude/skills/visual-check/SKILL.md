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
npm run build && mkdir -p .playwright-mcp
fuser 4173/tcp && echo "port 4173 is taken: pick another port"   # must print nothing
node_modules/.bin/vite preview --config vite.config.ts --port 4173 --strictPort > .playwright-mcp/preview.log 2>&1 &
echo $! > .playwright-mcp/preview.pid
curl -s --retry 10 --retry-connrefused --retry-delay 1 http://localhost:4173/ | grep -c 'Content-Security-Policy'   # expect 1
```

Run it in one shell call (or with the Bash tool's background mode, noting the PID). The grep confirms
the page is Bento's built page, not another server. If 4173 is taken, use another port below.

## 2. Screenshot four views

Screenshots must be saved inside the repo; use `.playwright-mcp/` (gitignored). For each of
phone `390x844` and desktop `1280x800`, and each scheme `light` and `dark`:

1. `browser_resize` to the width and height.
2. `browser_emulate_media` with `colorScheme`. The theme toggle defaults to Auto, which follows it.
3. `browser_navigate` to `http://localhost:4173/` (navigate again after changing state).
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
  `kill "$(cat .playwright-mcp/preview.pid)"`. Not `fuser -k`, which can hit another server on the
  port, and not `pkill -f` on its command line, which can match your own shell.
