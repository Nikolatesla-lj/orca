# LOCAL-S1 - Parent index only

## Parent and status

- PRD issue: GitHub Issues disabled; local fallback in use.
- Task slice issue: unavailable.
- Local parent doc: `docs/tasks/local/LOCAL-S1.md`
- Current status: complete
- Coding gate: do not code from this file.

## Child task docs

Use these child docs as the only implementation entry points:

| Child | Scope | Status rule |
|---|---|---|
| `LOCAL-S1A.md` | Diagram library list, internal feature flag, create/default source/rename/save/delete persistence, source-only shell, and minimum dirty guard needed to prevent draft loss. | May start only after its own coding gate is satisfied. |
| `LOCAL-S1B.md` | Full dirty-draft navigation coverage, external reload conflict, large-list behavior, and keyboard/accessibility coverage. | May start only after `LOCAL-S1A` is complete. |

## Completion rule

- S1 is complete only after both `LOCAL-S1A.md` and `LOCAL-S1B.md` pass their own automated tests, live evidence, mock policy, drift evidence, and PR evidence.
- Traceability rows R1-R6 and R14 must not be marked complete from this parent index.
- This file intentionally contains no acceptance criteria, test matrix, live steps, or implementation names so an agent cannot accidentally implement the oversized parent task.

## Completion evidence

- `LOCAL-S1A.md` is complete with targeted Vitest, type/lint/format checks, `git diff --check`, and Electron E2E evidence through a copied FX2 `.scryer/model.scry`.
- `LOCAL-S1B.md` is complete with targeted Vitest, `corepack pnpm run lint`, `corepack pnpm run tc`, `git diff --check`, and Electron E2E evidence covering dirty draft guard expansion, external reload conflicts, keyboard behavior, large-list behavior, and real FX2/FX9 `.scry` files.
- Mock policy: component-level mocks are paired with non-mocked model-store/E2E `.scry` write/reload evidence recorded in the child tasks.
- Drift note: S1 remains source-only and does not claim render, cache IPC, copy/export, thumbnail cache, or ref-management completion.
