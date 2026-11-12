# Bento

A bento box packs a whole meal into neat compartments. This one packs your fuel.

**Bento** plans carbohydrate, fluid, sodium and caffeine for **rides, runs and trail runs**. Pick Bike
or Run, then the type (road, gravel, MTB or indoor; road, trail or treadmill), a workout offered for
it (zone 2, endurance, intervals, gran fondo, ultra, race and more) and the fuel you carry (gels,
solids, drinks). Bento gives you:

- **Per-hour targets** for carbs (with a glucose:fructose ratio above 60 g/h), fluid, sodium and a caffeine cap.
- **A timeline** of what to take and when.
- **A packing list** with the plain water and extra sodium you still need.
- **Notes** on carb loading, the pre-session meal, heat, cold, altitude, trail technique and gut training.

It also accounts for duration, body weight, temperature, humidity, sweat rate and sweat sodium.
Settings and your own packs are saved in your browser only.

> Bento gives general guidance from sports-nutrition research, not medical advice. Test every product
> in training.

## Docs

- [Methodology](docs/methodology.md): every rule, its value and its source.
- [Research prompt](docs/research-prompt.md): an optional Fable research-mode prompt for a cited evidence report.

## Develop

Node 22.18 or newer runs the TypeScript tools and tests directly.

```sh
npm ci
npm run dev     # local dev server
npm test        # typecheck + unit tests with coverage (coverage/lcov.info)
npm run build   # static site in dist/
```

## Layout

```
site/                 React + TypeScript + Tailwind app (Vite root)
  src/lib/            Pure planner logic: factors, plan, products, storage, format, theme
  src/components/     PlanForm, FuelPackEditor, Summary, Timeline, ThemeToggle
tools/build.ts        Vite build into dist/
tests/                node --test unit tests
docs/                 Methodology and the research prompt
.github/workflows/    hashira static-webapp CI (pr.yml) and Pages deploy (deploy.yml)
```

## Deploy

`deploy.yml` runs the hashira static-webapp CI (build, tests with coverage, scan suite) and deploys
`dist/` to GitHub Pages on every push to `main`. In the repo settings, set Pages to deploy from **GitHub
Actions**. The site uses a relative base, so it works under `/bento/`.
