# CLAUDE.md: agent instructions

Bento is a carb, fluid and sodium fueling planner for rides, runs and trail runs, served as a static
site on GitHub Pages under `/bento/`. It is part of the Skathio ecosystem and shares the stack, layout
and CI of maneki.

## Hard rules

- **GitHub Pages only: static, no server.** No backend, no API calls, no secrets. Everything runs in the
  browser, and settings live in localStorage. The CSP (added to the built page by `vite.config.ts`) blocks inline styles and
  remote resources, so keep it that way: no `style=` attributes and no CDNs.
- Keep the relative base (`base: "./"` in `vite.config.ts`). Pages serves the site under `/bento/`.
- Planner logic goes in `site/src/lib` as **pure functions** with unit tests in `tests/`. Components only
  render and hold state.
- Every rule value has a row in `docs/methodology.md`. If you change a number, change its row as well
  (skill: `change-a-rule`).
- Bento gives general guidance and must not read as medical advice.
- **Visual testing is required for every change that affects what renders** (components, `styles.css`,
  `index.html`, icons, any lib change that alters displayed text or numbers). Build and serve the real
  site, screenshot it at phone (390 px) and desktop (1280 px) widths in light and dark mode, look at
  every screenshot, and show or describe them in the PR. Steps: skill `visual-check`.

## Commands (verified)

```sh
npm ci                # install (package-lock.json is committed)
npm test              # tsc --noEmit, then node --test over tests/**/*.test.ts with coverage -> coverage/lcov.info
npm run typecheck     # tsc --noEmit only
npm run build         # node tools/build.ts -> dist/ (CSP meta injected)
npm run dev           # Vite dev server, http://localhost:5173/ (no CSP: not for visual checks)
npx vite preview --config vite.config.ts --port 4173 --strictPort   # serve dist/ at http://localhost:4173/
```

Run one test file: `node --test tests/plan.test.ts`. There is no linter or formatter; `tsc` in strict
mode (`noUnusedLocals`, `noUncheckedIndexedAccess`) is the gate. A `DEP0205 module.register()`
deprecation warning on newer Node versions is harmless.

## Architecture

```
site/                  Vite root (index.html, favicon.svg, apple-touch-icon.png)
  src/main.tsx, App.tsx    mounts the app, holds Settings state, saves to localStorage
  src/components/      PlanForm, FuelPackEditor, Summary, Timeline, ThemeToggle, ui (shared bits)
  src/lib/             pure logic
    activities.ts      Bike/Run disciplines and workouts -> sport, terrain, intensity
    factors.ts         the rules: carb curves, fluid, sodium, caffeine, notes (cites the evidence review)
    plan.ts            builds the intake timeline and packing list from targets and packs
    options.ts         which "More options" fields can change the plan, so the form shows only those
    products.ts        preset fuel packs; storage.ts parses localStorage defensively
    types.ts, format.ts, theme.ts   shared types, display formatting, light/dark pin
tests/                 node --test: a file per tested lib module, plus scenarios, csp, ci and requirements
docs/                  methodology.md (every rule value), evidence-review-2026-11.md, research-prompt.md
tools/build.ts         runs the Vite build
```

## Conventions

- TypeScript with erasable syntax only and `.ts` import extensions; Node >= 22.18 runs `tools/` and
  `tests/` directly. Vite 6, React 18.3, Tailwind 4.
- Theme tokens are in `site/src/styles.css` and use `light-dark()`, so dark mode needs no `dark:`
  variants. `site/src/lib/theme.ts` pins light or dark through `data-theme` (localStorage `bento.theme`).
- An option appears in the form only when it can change the plan; `tests/options.test.ts` enforces it.
- `tests/requirements.test.ts` holds the user's requirements. Do not edit it. It is excluded from the
  typecheck only.
- `tests/scenarios.test.ts` checks whole sessions against the evidence review's ranges; extend it when a
  rule change moves a scenario.
- Commits: short imperative sentence, no type prefix ("Take FTP in W/kg only"). Branches `feat/`,
  `fix/`, `chore/`; one PR per change, merged by the maintainer with a merge commit.

## CI/CD

- `.github/workflows/ci.yml` calls `skathio/hashira`'s `static-webapp-ci.yml` (v3): build, `npm test` with
  coverage, scan suite and SoMi's quality gate (on by default at `strict`; it scores only what a PR
  changes). It runs on every PR, on push to `main` touching site, tools, tests, package or config files,
  and by hand. Its `deploy` job, skipped on PRs and off `main`, then publishes `dist/` with hashira's
  `pages-deploy`. There is no release or tag step: merging to `main` deploys.
- hashira is pinned to the 40-character SHA of a release tag's commit, twice in `ci.yml` (the
  `static-webapp-ci.yml` and `pages-deploy` `uses:` lines), and both must match: `tests/ci.test.ts`
  fails otherwise. v3 has no `library_ref` input, so a Dependabot bump of both pins needs no hand fix.
- `homepage.yml` pings the skathio homepage when `.github/homepage.json` or `site/favicon.svg` changes on
  `main`.

## Pitfalls

- The CSP exists only in the built page. `npm run dev` hides CSP breakage (inline styles, remote fonts),
  so check rendering against `dist/` through `vite preview`.
- `dist/`, `coverage/`, `.somi/` and `.playwright-mcp/` are gitignored. Never commit screenshots.
- The Playwright MCP may only write inside the repo: save screenshots under `.playwright-mcp/`.
