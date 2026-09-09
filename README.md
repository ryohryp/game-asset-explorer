# Game Asset Explorer

Asset DevTools for managing game image assets in VS Code.

Game Asset Explorer is a VS Code extension for quickly understanding and operating on image assets inside game projects.

The goal is not to build another standalone image viewer or a full DAM. The extension should help answer practical development questions without leaving VS Code:

- Where is this asset?
- What is this image for?
- Where is it referenced?
- Is it unused?
- Are there broken references?
- Can it be safely replaced or reorganized?
- Later: where did an AI-generated asset come from, and what variants exist?

## Principles

- The filesystem is the source of truth for whether an image asset exists.
- Prefer Git-friendly project files over a proprietary database.
- Keep VS Code-specific UI separate from reusable core logic.
- Avoid tight coupling to a specific game engine or framework.
- Do not require game code to use a custom Asset API.
- Support existing reference styles where practical: imports, relative paths, URLs, and future asset IDs.
- Start small and validate the extension against real game-development workflows before expanding it.

## MVP

The first usable version should provide:

1. Scan configured asset directories.
2. Display image thumbnails in a grid.
3. Search by filename and workspace-relative path.
4. Show Asset Details.
5. Copy Asset Path.
6. Find Usages in the workspace.
7. Automatically reflect added, deleted, and changed image files.

## Asset scanning, search, and thumbnail grid

Game Asset Explorer scans configured directories recursively for `.png`, `.jpg`, `.jpeg`, `.webp`, and `.gif` files.

Configure one or more workspace-relative directories in `.vscode/settings.json` or VS Code Settings:

```json
{
  "gameAssetExplorer.assetDirectories": ["assets", "public/images"]
}
```

Available commands:

- **Game Asset Explorer: Scan Assets** rescans the configured directories and reports how many images were found.
- **Game Asset Explorer: Open Asset Grid** rescans and opens a responsive thumbnail grid in a VS Code panel.

The grid shows each image together with its filename, workspace folder, and workspace-relative path. The search box filters the already-discovered assets in memory using case-insensitive filename and relative-path matching; typing does not rescan the filesystem. Use the **Refresh** button in the panel to rescan explicitly. Empty scans show an empty state, and a single image that can no longer be rendered does not prevent the rest of the grid from displaying.

### Development

```bash
npm install
npm test
```

Open the repository in VS Code and press `F5` using the **Run Game Asset Explorer** launch configuration to start an Extension Development Host.

## Not in the MVP

These are candidates for later phases, only if they solve real development pain:

- Manifest / stable asset IDs
- Unused Asset detection
- Missing Reference detection
- Duplicate candidates
- Asset Health dashboard
- Safe Rename / Replace
- CLI
- CI / GitHub Actions integration
- AI generation metadata
- Variant management
- Generate Variant
- Asset Dependency Graph

## Product direction

The intended position is **Asset DevTools for VS Code**, rather than a standalone asset-management application.

Before adding a feature, ask:

> Does this make working with image assets during actual game development easier?

Prefer concrete current problems over speculative future architecture.

## Status

MVP implementation in progress. Asset-directory scanning, thumbnail browsing, workspace-aware asset identity, and in-memory search are implemented.
