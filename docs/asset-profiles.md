# Asset Profiles and semantic asset types

Game Asset Explorer can organize image assets using a game-genre-oriented **Asset Profile** without changing how image files are discovered.

## Source of truth

The filesystem remains authoritative for whether an image asset exists. Asset Profiles do not create assets, hide missing files from filesystem discovery, require a folder layout, or require game code to use a custom asset API.

Semantic type assignments are optional metadata stored per workspace in:

```text
.game-asset-explorer/asset-types.json
```

The file is intended to be Git-friendly and contains only workspace-relative image paths mapped to semantic type names:

```json
{
  "schemaVersion": 1,
  "assignments": {
    "assets/characters/hero.png": "Character",
    "assets/ui/menu.png": "UI"
  }
}
```

An image with no valid assignment for the active profile is shown as **Uncategorized**. A stored assignment that belongs to another profile is preserved in the metadata file but treated as Uncategorized until a profile that supports it becomes active again.

## Profiles

Built-in profiles are:

- Generic
- RPG
- Action
- Visual Novel
- Card Game
- Custom

Select the active profile with `gameAssetExplorer.assetProfile`. When `custom` is selected, `gameAssetExplorer.customAssetTypes` defines the available semantic types.

Changing either setting refreshes the open Asset Grid without restarting the extension host.

## UI behavior

The Asset Grid keeps filesystem format (`PNG`, `JPG`, and so on) separate from semantic Asset Type.

- **Asset Type** filters by the active profile's semantic categories plus Uncategorized.
- **Format** filters by image file format.
- Cards show the semantic type or Uncategorized.
- Asset Details lets the user change the semantic type for the selected asset.

Saving a type updates only `.game-asset-explorer/asset-types.json`. It does not rename, move, create, or delete the image itself.

## Boundaries

Asset Profile definitions, type validation, metadata parsing/serialization, and facet filtering are VS Code-independent. VS Code integration owns workspace configuration, file IO for the metadata file, watchers, and Webview interaction.

This feature intentionally does not provide automatic type inference, AI classification, per-genre Asset Health rules, a manifest, or stable asset IDs. Those should only be added later if real game-development use demonstrates the need.
