# MVP Architecture

This document describes the current architecture for Game Asset Explorer. It is intentionally limited to decisions needed for the MVP.

## Goals

The MVP should make image assets easy to discover and inspect inside VS Code without forcing a game project to adopt a custom runtime API or metadata database.

The filesystem remains the source of truth for asset existence.

## Module boundaries

### Core (`src/core`)

Core code must not depend on the VS Code API.

Core owns:

- supported image-format rules
- recursive asset scanning
- normalized asset records
- filename/path filtering and search logic
- filesystem-derived asset metadata when needed
- reusable usage-matching logic that can operate on supplied text/search results

Core does not own:

- VS Code workspace discovery
- VS Code configuration APIs
- commands
- Webviews
- file watchers
- editor navigation
- workspace text-search execution

### VS Code integration (`src/extension.ts` and adapters)

The VS Code layer owns:

- reading workspace folders and settings
- invoking core scans for each workspace folder
- combining multi-root workspace results
- commands and editor actions
- file-system watchers
- VS Code workspace search for Find Usages
- opening files and navigating to usage locations
- translating filesystem paths to Webview-safe URIs

### UI (`src/ui`)

UI code owns presentation and user interaction only.

It should receive prepared asset/view data and emit explicit actions such as refresh, select asset, copy path, or find usages. It should not recursively scan directories or implement reference analysis itself.

## Asset model

Scanning should stay cheap. The base asset record contains only information available without decoding image contents.

```ts
export type AssetFileType = "png" | "jpg" | "jpeg" | "webp" | "gif";

export interface AssetRecord {
  absolutePath: string;
  relativePath: string;
  fileName: string;
  fileType: AssetFileType;
}

export interface WorkspaceAsset {
  workspaceFolderUri: string;
  workspaceFolderName: string;
  asset: AssetRecord;
}
```

`WorkspaceAsset` is the VS Code/application-level object. Keeping workspace identity outside the scanner allows core scanning to remain reusable while avoiding ambiguity in multi-root workspaces.

### Asset details

Metadata that is not needed to populate the grid should be loaded on demand rather than during every scan.

```ts
export interface AssetDetails {
  sizeBytes: number;
  modifiedAt: number;
  width?: number;
  height?: number;
}
```

File size and modification time can be added without an image-decoding dependency. Width and height may be added when Asset Details requires them; they do not need to block the current MVP.

## MVP asset identity

There is no stable asset ID or manifest in the MVP.

Within one running workspace, an asset is identified by:

```text
workspaceFolderUri + relativePath
```

A rename therefore changes identity in the MVP. That is acceptable until Safe Rename, persistent metadata, or generated variants create a concrete need for stable IDs.

See `docs/adr/0001-mvp-asset-identity.md`.

## Configuration

The existing setting remains the MVP configuration surface:

```json
{
  "gameAssetExplorer.assetDirectories": ["assets", "public/images"]
}
```

Rules:

- configuration is resource/workspace-folder scoped
- directories are scanned recursively
- workspace-relative paths are preferred
- absolute directories may remain supported, but assets outside the workspace should be treated carefully by UI/editor actions
- invalid or unreadable directories produce warnings rather than failing the whole scan

Do not add a project-level manifest merely to configure scan roots.

## Search

MVP search should filter the already-discovered asset list in memory.

Search targets:

1. filename
2. workspace-relative path

Matching should initially be case-insensitive substring matching.

Tags are not an MVP data source yet. The UI should not imply persistent tag support until a concrete metadata source is introduced.

## Find Usages

Find Usages should start with workspace text search rather than AST or engine-specific parsing.

For a selected asset, search for practical reference candidates such as:

- the workspace-relative path
- path variants with common `./` or leading `/` forms when relevant
- the filename as a fallback candidate

Results should retain file and range information so VS Code can navigate directly to the match.

False positives are acceptable in the MVP; hidden false negatives caused by pretending to understand every engine/framework are not.

The search executor belongs to the VS Code layer. Candidate generation and result normalization may live in core if they remain VS Code-independent.

## File change tracking

The watcher is a VS Code concern.

MVP behavior:

- watch supported image files under configured asset roots
- react to create/delete/change
- debounce bursts of events
- rescan and refresh the current asset list/grid

Prefer a simple debounced rescan before implementing a complex incremental index. Optimize only if real projects show that rescanning is too slow.

## State

The in-memory discovered asset list is derived state, not authoritative data. It may be rebuilt at any time from the filesystem and current workspace configuration.

No database or cache file is required for the MVP.

## Explicitly deferred

The architecture intentionally does not define these yet:

- manifest schema
- stable asset IDs
- persistent tags
- unused-asset semantics
- missing-reference semantics
- safe rename/replace transactions
- duplicate detection
- engine-specific reference parsers
- AI generation metadata
- variant lifecycle

These should be designed only when an implemented workflow requires them.
