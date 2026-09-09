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

## MVP priorities

Focus first on:

1. Asset-directory scanning
2. Thumbnail grid
3. Search
4. Asset details
5. Copy Asset Path
6. Find Usages
7. File-system change tracking

Do not implement future features merely because they may become useful later.

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
2. Confirm that the Issue is inside the current MVP and is implementation-ready: goal, scope, non-goals, and acceptance criteria are clear enough to act on.
3. Implement the smallest change that satisfies the acceptance criteria.
4. Add or update focused tests for changed behavior.
5. Run `npm test`. Compilation and every discovered compiled test must pass.
6. Review the complete diff for regressions, architecture-boundary violations, unnecessary dependencies, and unrelated changes.
7. Open a PR that explains the change and links/closes the Issue.
8. Treat CI success as required before the loop is complete.

Do not combine unrelated Issues merely to make a larger batch. Small supporting refactors are allowed only when they are directly required by the selected Issue.

See `docs/loop-engineering.md` for the lifecycle and stop conditions.

## Stop and escalation conditions

Stop implementation and surface the decision instead of silently expanding scope when any of these is true:

- The change would add a manifest, stable asset ID, database, engine-specific parser, AI-generation workflow, CLI/CI product feature, or another explicitly deferred capability.
- The selected Issue conflicts with `docs/architecture.md` or an accepted ADR.
- Satisfying the Issue requires changing a product-level behavior or architecture boundary not covered by its acceptance criteria.
- A dependency or framework would be introduced mainly for future flexibility rather than the current Issue.
- Tests or CI fail and the cause cannot be resolved within the Issue's scope.
- MVP items 1-7 are complete. At that point, stop autonomous feature expansion and validate the extension in a real game-development workflow before selecting post-MVP work.

When stopping, prefer creating or refining an Issue that makes the unresolved decision explicit rather than inventing the answer in code.

## Product decision rule

Before adding or expanding a feature, ask:

> Does this materially reduce friction in actual game image-asset work today?

If the answer is unclear, prefer the smaller implementation.

## Future candidates

Only after MVP validation:

- Manifest / stable asset IDs
- Unused and missing-reference detection
- Duplicate detection
- Asset Health
- Safe Rename / Replace
- CLI / CI integration
- AI generation metadata
- Variant management
- Dependency graph
