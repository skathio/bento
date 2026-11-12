# CLAUDE.md: agent instructions

Bento is a carb, fluid and sodium fueling planner for rides, runs and trail runs. It is part of the
Skathio ecosystem: it shares the stack, layout and CI of maneki.

## Hard rules

- **GitHub Pages only: static, no server.** No backend, no API calls, no secrets. Everything runs in the
  browser, and settings live in localStorage. The CSP (added to the built page by `vite.config.ts`) blocks inline styles and
  remote resources, so keep it that way: no `style=` attributes and no CDNs.
- Keep the relative base (`base: "./"` in `vite.config.ts`). Pages serves the site under `/bento/`.
- Planner logic goes in `site/src/lib` as **pure functions** with unit tests in `tests/`. Components only
  render and hold state.
- Every rule value has a row in `docs/methodology.md`. If you change a number, change its row as well.
- Bento gives general guidance and must not read as medical advice.

## Stack

Vite 6, React 18.3, TypeScript (erasable syntax only, `.ts` import extensions), Tailwind 4, and
Node >= 22.18, which runs `tools/` and `tests/` without a build step.

- Theme tokens are in `site/src/styles.css`. They use `light-dark()`, so dark mode needs no `dark:`
  variants. `site/src/lib/theme.ts` pins light or dark through `data-theme`.
- `npm test` runs the typecheck and then `node --test` with coverage. The coverage is uploaded to
  `coverage/lcov.info` by hashira CI.
- `tests/requirements.test.ts` holds the user's requirements. Do not edit it. It is excluded from the
  typecheck only.

## CI/CD

`.github/workflows/pr.yml` and `deploy.yml` call `skathio/hashira`'s `static-webapp-ci.yml`, and deploy
uses `pages-deploy`. Both are pinned to one SHA, and that SHA must match in both files and in
`library_ref`.
