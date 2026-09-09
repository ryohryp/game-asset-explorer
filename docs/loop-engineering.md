# Loop Engineering

This repository uses an issue-driven engineering loop for MVP development.

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

1. **Read current state** — Start from the current base branch and read `AGENTS.md`, relevant architecture/ADR documents, and the selected Issue.
2. **Select bounded work** — Prefer the next open MVP Issue whose dependencies are satisfied. Do not jump to deferred features because they look interesting or useful later.
3. **Implement minimally** — Make the smallest coherent change that satisfies the Issue. Preserve existing architecture boundaries.
4. **Validate** — Run `npm test`; it compiles the project and runs all compiled tests under `dist/test` matching `*.test.js`.
5. **Self-review** — Review the full diff for regressions, unrelated changes, unnecessary dependencies, scope creep, and violations of `docs/architecture.md` or ADRs.
6. **PR and CI** — Open a PR linked to the Issue. The loop is not complete until required CI passes.
7. **Advance** — After merge, reassess the current repository and open Issues before selecting the next unit. Do not blindly replay an old plan.

## Failure handling

A failed test or CI run is part of the same loop when the failure was caused by the Issue's change and can be corrected without expanding scope.

Do not bypass, delete, or weaken a meaningful test merely to make the loop green. If a test is obsolete because accepted behavior changed, explain that behavior change in the Issue/PR.

If a failure exposes a separate defect, create a focused Issue rather than silently broadening the current PR unless the defect directly blocks the selected Issue and the fix is small and safe.

## Human/product checkpoints

Stop the autonomous feature loop when:

- an Issue requires a product or architecture decision outside its acceptance criteria;
- implementation conflicts with an accepted ADR or architecture boundary;
- the proposed solution introduces a deferred capability such as stable asset IDs, a manifest, a database, engine-specific parsing, or AI generation;
- a substantial new dependency or infrastructure component is proposed mainly for future flexibility;
- MVP items 1-7 are complete.

After MVP completion, validate Game Asset Explorer in a real game project before deciding which post-MVP problem deserves the next loop. Observed development friction should drive that decision.

## MVP completion checkpoint

The current MVP is complete when these workflows are usable together:

1. configured asset-directory scanning;
2. thumbnail-grid browsing;
3. filename/path search;
4. Asset Details;
5. Copy Asset Path;
6. Find Usages;
7. automatic tracking of image additions, deletions, and changes.

At that point, do not automatically continue into Unused Assets, Missing References, manifests, variants, AI generation, or other future candidates.
