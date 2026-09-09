# AGENTS.md

## Project goal

Build Game Asset Explorer as a VS Code extension that makes image-asset work during game development faster and safer.

The product should help developers discover assets, understand what they are, find usages, identify problems, and reorganize or replace assets with confidence.

## Source of truth

- The game project's filesystem is the source of truth for whether an image exists.
- Do not introduce a database as the authoritative store for asset existence.
- If a manifest is introduced later, it should describe meaning and metadata, not replace the filesystem.

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
- Avoid unnecessary framework or engine coupling.
- Avoid requiring consuming game projects to adopt a custom asset runtime API.
- Prefer simple filesystem and workspace-search behavior before AST-heavy analysis.
- Keep the design Git-friendly and understandable from repository files.
- Avoid overengineering, background services, or infrastructure not required by the current milestone.

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
