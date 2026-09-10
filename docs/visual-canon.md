# Visual Canon

Visual Canon is optional, Git-reviewable project metadata for visual meaning and generation constraints. It does not replace the filesystem as the source of truth for whether an image exists.

The canonical file location is:

```text
.game-asset-explorer/visual-canon.json
```

The initial format is deliberately small and dependency-free JSON:

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "id": "goblin",
      "kind": "character",
      "anchors": [
        "assets/enemies/goblin_idle.png",
        "assets/enemies/goblin_portrait.png"
      ],
      "constraints": [
        "hand-painted dark fantasy",
        "moss-green palette"
      ],
      "forbidden": [
        "photorealistic"
      ]
    }
  ]
}
```

`kind` uses the existing Generation Package asset kinds: `character`, `environment`, `ui`, `item`, `effect`, or `other`.

Every anchor must be a supported image path relative to the workspace. Absolute paths, parent traversal, URLs, and unsupported file types are rejected. Resolution also checks anchors against the current filesystem-derived asset set. A missing required anchor fails closed; another image is never substituted silently.

When a Canon entry is explicitly resolved for Generate Variant, its id becomes `context.subjectId`, its constraints/forbidden lists become Generation Package context, and additional anchors become required style references. The asset selected by the developer remains the required `source` Approved Anchor.

Provider credentials, provider-specific request options, generated candidate bytes, and asset-existence state do not belong in Visual Canon.

The core parser/resolver is VS Code-independent. Workspace loading and Asset Details membership presentation are separate integration concerns tracked by parent issue #15.
