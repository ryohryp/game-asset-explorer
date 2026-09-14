# Asset Profiles and category slots

Game Asset Explorer can organize image assets using a game-genre-oriented **Asset Profile** without changing how image files are discovered.

## Source of truth

The filesystem remains authoritative for whether an image asset exists. Asset Profiles do not create assets, hide missing files from filesystem discovery, require a folder layout, or require game code to use a custom asset API.

Semantic type assignments are optional metadata stored per workspace in:

```text
.game-asset-explorer/asset-types.json
```

The file is Git-friendly. Existing schemaVersion 1 files remain valid, and optional subtype assignments use the same file:

```json
{
  "schemaVersion": 1,
  "assignments": {
    "assets/characters/hero_attack.png": "Character",
    "assets/ui/menu.png": "UI"
  },
  "subtypes": {
    "assets/characters/hero_attack.png": "attack"
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

Select the active profile with `gameAssetExplorer.assetProfile`. When `custom` is selected, `gameAssetExplorer.customAssetTypes` defines the starting semantic types.

Some categories expose a deliberately small set of expected subtype slots. For example, the RPG preset includes `Character / portrait`, `Character / idle`, `Character / attack`, and other bounded slots. Categories such as `Background` remain valid without a subtype.

Use **Game Asset Explorer: Show Asset Categories** to inspect category and subtype counts. Expected slots remain visible even when the count is zero.

## Project overrides

Genre presets are defaults, not mandatory schemas. Store `gameAssetExplorer.assetProfileOverrides` in the workspace's `.vscode/settings.json` when a project needs a different category shape.

Example:

```json
{
  "gameAssetExplorer.assetProfile": "rpg",
  "gameAssetExplorer.assetProfileOverrides": {
    "addAssetTypes": ["Quest Art"],
    "removeAssetTypes": ["Armor"],
    "subtypes": {
      "Character": ["portrait", "battle"],
      "Quest Art": ["chapter", "reward"]
    }
  }
}
```

`subtypes` replaces the preset subtype list for the named category. An empty array removes subtype slots from that category. These overrides are normal workspace configuration, so projects can review them in Git without changing extension source code.

Changing profile settings refreshes the open Asset Grid without restarting the extension host.

## Asset subtype assignment

Select an asset in Asset Grid, then run **Game Asset Explorer: Set Selected Asset Subtype**. Only subtype values defined for the asset's current Asset Type are accepted.

If the Asset Type changes and the old subtype is no longer valid, Game Asset Explorer removes the stale subtype rather than keeping an inconsistent pair. No subtype is inferred from paths, filenames, folders, or image contents.

## UI behavior

The Asset Grid keeps filesystem format (`PNG`, `JPG`, and so on) separate from semantic Asset Type.

- **Asset Type** filters by the active profile's semantic categories plus Uncategorized.
- **Format** filters by image file format.
- Cards show the semantic type or Uncategorized.
- Asset Details lets the user change the semantic type for the selected asset.
- **Show Asset Categories** exposes the genre/project category schema and counts, including empty expected slots.
- **Set Selected Asset Subtype** explicitly assigns or clears the selected asset's subtype.

Saving type/subtype metadata updates only `.game-asset-explorer/asset-types.json`. It does not rename, move, create, or delete the image itself.

## Boundaries

Asset Profile definitions, subtype validation, metadata parsing/serialization, and category summarization are VS Code-independent. VS Code integration owns workspace configuration, file IO for the metadata file, watchers, and user interaction.

This feature intentionally does not provide automatic type/subtype inference, AI classification, missing-asset generation, per-genre Asset Health rules, a manifest, or stable asset IDs. Those should only be added later if real game-development use demonstrates the need.
