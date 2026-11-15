---
name: change-a-rule
description: Change a Bento fueling rule (a carb, fluid, sodium or caffeine value, threshold, curve or advisory note) and keep the code, docs/methodology.md and tests in step. Use when a number or condition in site/src/lib/factors.ts, plan.ts, activities.ts or options.ts changes.
---

# Change a rule

Every rule value lives in `site/src/lib` and has a row in `docs/methodology.md`, which cites the
evidence review (`docs/evidence-review-2026-11.md`, sections like A1, C4) and grades it H, M, L or PC.

1. **Find the rule.** Targets and notes: `site/src/lib/factors.ts`. Timeline and packing list:
   `plan.ts`. Workouts and their mapping: `activities.ts`. When an option shows: `options.ts`.
   Input ranges and defaults: `storage.ts`.
2. **Change the value** in the pure function or constant. Keep the comment's source reference
   (for example `(evidence review A1)`) accurate.
3. **Update its row** in `docs/methodology.md`: the value, the source section and the grade. A new
   rule gets a new row; a removed one loses its row.
4. **Update the tests:** the module's file in `tests/` (`factors.test.ts`, `plan.test.ts`,
   `options.test.ts` …). If a whole-session outcome moves, update or add a case in
   `tests/scenarios.test.ts`. Never edit `tests/requirements.test.ts`.
5. **Wording:** notes give general guidance, never medical advice ("about", "a guide, not a target").
6. **Run** `npm test`. If an option's visibility, a displayed number or a note changed, run the
   `visual-check` skill too.
