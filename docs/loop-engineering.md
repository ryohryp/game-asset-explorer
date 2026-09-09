# Loop Engineering

This repository uses an issue-driven engineering loop for ongoing development.

The purpose of the loop is to reduce manual prompting while keeping product direction, architecture, and validation explicit. It is not permission for an agent to expand the product autonomously.

## Unit of work

A normal loop is one implementation-ready GitHub Issue and one corresponding PR.

An implementation-ready Issue should state:

- Goal
- Scope
- Non-goals
- Acceptance criteria

If these are not clear enough to implement safely, refine the Issue before changing code.

## Lifecycle

1. **Read current state** — Start from the current base branch and read `AGENTS.md`, relevant architecture/ADR documents, and open Issues.
2. **Select bounded work** — Prefer the highest-value implementation-ready Issue whose dependencies are actually present on the base branch. Skip Issues whose only remaining work is deferred manual validation.
3. **Implement minimally** — Make the smallest coherent change that satisfies the Issue. Preserve existing architecture boundaries.
4. **Validate** — Run `npm test`; it compiles the project and runs all compiled tests under `dist/test` matching `*.test.js`.
5. **Self-review** — Review the full diff for regressions, unrelated changes, unnecessary dependencies, scope creep, and violations of `docs/architecture.md` or ADRs.
6. **PR and CI** — Open a PR linked to the Issue. Required CI must pass before the engineering implementation is considered complete.
7. **Manual validation bookkeeping** — If the Issue also requires VS Code/dogfood checks and the user has explicitly chosen batched validation, record those checks as pending rather than pretending they passed. The implementation PR may merge while the Issue remains open for that validation.
8. **Advance** — After merge, reassess the current repository and open Issues before selecting the next unit. Do not blindly replay an old plan.

## Failure handling

A failed test or CI run is part of the same loop when the failure was caused by the Issue's change and can be corrected without expanding scope.

Do not bypass, delete, or weaken a meaningful test merely to make the loop green. If a test is obsolete because accepted behavior changed, explain that behavior change in the Issue/PR.

If a failure exposes a separate defect, create a focused Issue rather than silently broadening the current PR unless the defect directly blocks the selected Issue and the fix is small and safe.

## Deferred manual validation

Manual validation remains useful, especially for visual behavior, keyboard interaction, real-project scale, and workflows that cannot be proven by unit tests or CI.

When the user explicitly chooses to batch these checks later:

- keep the validation checklist visible in the relevant Issue;
- do not mark the checks as passed until they are actually performed;
- allow a green implementation PR to merge when the remaining checks are manual-only and the code change is otherwise reviewable;
- leave the Issue open if its acceptance criteria still require that validation;
- skip that manual-validation-only Issue when choosing the next engineering loop;
- return to the accumulated checks in a later dogfood session.

This deferral is for manual verification only. It does not waive compilation, automated tests, CI, architecture review, or safety checks.

## Human/product checkpoints

Stop the autonomous feature loop when:

- an Issue requires a product or architecture decision outside its acceptance criteria;
- implementation conflicts with an accepted ADR or architecture boundary;
- the proposed solution introduces a deferred high-impact capability such as stable asset IDs, a manifest, a database, engine-specific parsing, AI generation, or a new CLI/CI product surface without separate approval;
- a substantial new dependency or infrastructure component is proposed mainly for future flexibility;
- required automated validation cannot be made green within the Issue's scope;
- an Issue depends on implementation that is not actually present on the base branch;
- no implementation-ready Issue remains within the approved product/architecture boundaries.

MVP completion alone is not a stop condition. A pending manual dogfood checkpoint alone is not a stop condition when batched validation has been explicitly chosen.

## MVP baseline

The MVP baseline consists of these workflows:

1. configured asset-directory scanning;
2. thumbnail-grid browsing;
3. filename/path search;
4. Asset Details;
5. Copy Asset Path;
6. Find Usages;
7. automatic tracking of image additions, deletions, and changes.

Post-MVP work should be driven by concrete developer friction, dogfood findings, and implementation-ready Issues. Do not automatically jump from MVP completion into manifests, stable IDs, AI generation, persistent databases, or other speculative architecture.
