# AGENTS.md

## Project goal

Build Game Asset Explorer as a VS Code extension that makes image-asset work during game development faster and safer.

The product should help developers discover assets, understand what they are, find usages, identify problems, and reorganize or replace assets with confidence.

## Source of truth

Use repository state in this order when making implementation decisions:

1. Code and configuration on the current base branch.
2. `AGENTS.md`, `docs/architecture.md`, and accepted ADRs.
3. The selected GitHub Issue and its acceptance criteria.
4. README/product direction where it does not conflict with the sources above.

The game project's filesystem is the source of truth for whether an image exists.

- Do not introduce a database as the authoritative store for asset existence.
- If a manifest is introduced later, it should describe meaning and metadata, not replace the filesystem.
- Do not treat previous conversations, generated plans, or speculative future designs as more authoritative than the repository.

## MVP baseline

The MVP baseline consists of:

1. Asset-directory scanning
2. Thumbnail grid
3. Search
4. Asset details
5. Copy Asset Path
6. Find Usages
7. File-system change tracking

These workflows are implemented. Post-MVP work should still be selected from concrete developer friction and implementation-ready Issues rather than speculative future architecture.

## Architecture guidance

- Keep VS Code UI/integration separate from reusable core logic.
- Keep core logic independent of the VS Code API.
- Avoid unnecessary framework or engine coupling.
- Avoid requiring consuming game projects to adopt a custom asset runtime API.
- Prefer simple filesystem and workspace-search behavior before AST-heavy analysis.
- Keep the design Git-friendly and understandable from repository files.
- Avoid overengineering, background services, or infrastructure not required by the current milestone.

## Loop Engineering workflow

Normal autonomous implementation work follows one Issue per loop and normally one PR per Issue.

For each loop:

1. Read the current base branch, this file, relevant architecture/ADR documents, and the selected open Issue.
2. Confirm that the Issue is implementation-ready: goal, scope, non-goals, and acceptance criteria are clear enough to act on, dependencies are satisfied, and it does not cross a hard stop below.
3. Implement the smallest change that satisfies the acceptance criteria that can be validated in the current engineering environment.
4. Add or update focused tests for changed behavior.
5. Run `npm test`. Compilation and every discovered compiled test must pass.
6. Review the complete diff for regressions, architecture-boundary violations, unnecessary dependencies, and unrelated changes.
7. Open a PR that explains the change and links/closes the Issue when all required validation for that Issue is complete.
8. Treat CI success as required before the engineering portion of the loop is complete.
9. After merge, reassess current repository state and open Issues before selecting the next implementation-ready unit.

Do not combine unrelated Issues merely to make a larger batch. Small supporting refactors are allowed only when they are directly required by the selected Issue.

### Deferred manual validation

Manual VS Code/dogfood checks may be batched when the user explicitly chooses to validate later.

- Do not claim deferred manual validation passed.
- An Issue may remain open after its implementation PR is merged if only deferred manual validation remains.
- Such an Issue must not block selection of another implementation-ready Issue.
- When selecting work, skip Issues whose only remaining action is deferred manual validation.
- Preserve the pending validation in the Issue so it can be reviewed in a later dogfood batch.

See `docs/loop-engineering.md` for the lifecycle and stop conditions.

## Stop and escalation conditions

Stop implementation and surface the decision instead of silently expanding scope when any of these is true:

- The change would add a manifest, stable asset ID, database, engine-specific parser, AI-generation workflow, CLI/CI product feature, or another explicitly deferred high-impact capability without separate approval.
- The selected Issue conflicts with `docs/architecture.md` or an accepted ADR.
- Satisfying the Issue requires changing a product-level behavior or architecture boundary not covered by its acceptance criteria.
- A dependency or framework would be introduced mainly for future flexibility rather than the current Issue.
- Tests or CI fail and the cause cannot be resolved within the Issue's scope.
- The Issue depends on another implementation that does not actually exist on the current base branch.
- No implementation-ready Issue remains that can be completed without one of the conditions above.

MVP completion by itself is not a stop condition. Pending manual dogfood validation by itself is also not a stop condition when the user has explicitly chosen batched validation.

When stopping, prefer creating or refining an Issue that makes the unresolved decision explicit rather than inventing the answer in code.

## Product decision rule

Before adding or expanding a feature, ask:

> Does this materially reduce friction in actual game image-asset work today?

If the answer is unclear, prefer the smaller implementation.

## Future candidates

Consider only when a concrete workflow and Issue justify them:

- Manifest / stable asset IDs
- Unused and missing-reference detection
- Duplicate detection
- Asset Health
- Safe Rename / Replace
- CLI / CI integration
- AI generation metadata
- Variant management
- Dependency graph
