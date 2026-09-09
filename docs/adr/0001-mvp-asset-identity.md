# ADR 0001: MVP asset identity uses workspace plus relative path

- Status: Accepted
- Date: 2026-09-10

## Context

Game Asset Explorer needs to distinguish image assets while scanning and presenting them in VS Code, including multi-root workspaces.

A stable asset ID backed by a manifest could solve identity across renames, but introducing that now would add metadata lifecycle, synchronization, migration, and failure modes before the MVP has demonstrated a need for persistent identity.

Using only `relativePath` is also insufficient because two workspace folders can contain the same path.

## Decision

For the MVP, an asset is identified within the active VS Code workspace by the pair:

```text
workspaceFolderUri + relativePath
```

The reusable scanner continues to produce filesystem-focused records. The VS Code/application layer associates each record with its workspace folder.

No manifest or stable asset ID is introduced for MVP identity.

## Consequences

### Positive

- avoids introducing a manifest before it is needed
- works correctly in multi-root workspaces
- identity is deterministic and reconstructable from the filesystem
- no synchronization problem exists between a database/manifest and the actual files

### Accepted limitations

- renaming or moving a file changes its identity
- persistent tags cannot safely follow a rename without an additional mechanism
- generated-asset variant relationships are not modeled yet

These limitations are acceptable for the MVP.

## Revisit when

Reconsider stable asset IDs only when a concrete feature requires identity to survive path changes, such as:

- Safe Rename / Replace
- persistent user-authored metadata or tags
- asset variants
- generation provenance
- cross-project references

At that point, a manifest may be introduced for meaning and metadata while the filesystem remains authoritative for asset existence.
