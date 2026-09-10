import assert from "node:assert/strict";
import test from "node:test";
import { VisualCanonError } from "../src/core/visualCanon";
import {
  loadWorkspaceVisualCanonForAsset,
  resolveUnambiguousWorkspaceVisualCanon,
  resolveWorkspaceVisualCanonMembership,
  type WorkspaceVisualCanonReader,
} from "../src/visualCanonWorkspace";
import { type WorkspaceAsset } from "../src/workspaceAsset";

function asset(workspaceFolderUri: string, relativePath: string): WorkspaceAsset {
  const fileName = relativePath.split("/").at(-1) ?? relativePath;
  return {
    workspaceFolderUri,
    workspaceFolderName: workspaceFolderUri,
    asset: {
      absolutePath: `${workspaceFolderUri}/${relativePath}`,
      relativePath,
      fileName,
      fileType: "png",
    },
  };
}

const selected = asset("file:///game-a", "assets/goblin_idle.png");
const canonText = JSON.stringify({
  schemaVersion: 1,
  entries: [{
    id: "goblin",
    kind: "character",
    anchors: ["assets/goblin_idle.png", "assets/goblin_style.png"],
    constraints: ["moss-green palette"],
  }],
});

test("missing workspace Canon is optional and yields no memberships", async () => {
  const reader: WorkspaceVisualCanonReader = { read: async () => undefined };
  assert.deepEqual(await loadWorkspaceVisualCanonForAsset(selected, reader), { memberships: [] });
});

test("loads selected-asset Canon membership from its workspace", async () => {
  let requestedWorkspace: string | undefined;
  const reader: WorkspaceVisualCanonReader = {
    read: async (workspaceFolderUri) => {
      requestedWorkspace = workspaceFolderUri;
      return canonText;
    },
  };
  const state = await loadWorkspaceVisualCanonForAsset(selected, reader);
  assert.equal(requestedWorkspace, "file:///game-a");
  assert.deepEqual(state.memberships, [{ id: "goblin", kind: "character", anchor: true }]);
});

test("invalid workspace Canon fails closed through the core parser", async () => {
  const reader: WorkspaceVisualCanonReader = { read: async () => "not-json" };
  await assert.rejects(() => loadWorkspaceVisualCanonForAsset(selected, reader), VisualCanonError);
});

test("resolves membership only against filesystem assets in the selected workspace", async () => {
  const reader: WorkspaceVisualCanonReader = { read: async () => canonText };
  const state = await loadWorkspaceVisualCanonForAsset(selected, reader);
  assert.ok(state.canon);

  assert.throws(
    () => resolveWorkspaceVisualCanonMembership(selected, state.canon!, "goblin", [
      selected,
      asset("file:///game-b", "assets/goblin_style.png"),
    ]),
    (error: unknown) => error instanceof VisualCanonError && error.message.includes("goblin_style.png"),
  );

  const resolved = resolveWorkspaceVisualCanonMembership(selected, state.canon!, "goblin", [
    selected,
    asset("file:///game-a", "assets/goblin_style.png"),
  ]);
  assert.equal(resolved.entry.id, "goblin");
  assert.equal(resolved.context.subjectId, "goblin");
});

test("refuses to resolve a Canon entry that does not anchor the selected asset", async () => {
  const otherCanon = JSON.stringify({
    schemaVersion: 1,
    entries: [{ id: "forest", kind: "environment", anchors: ["assets/forest.png"] }],
  });
  const state = await loadWorkspaceVisualCanonForAsset(selected, { read: async () => otherCanon });
  assert.ok(state.canon);
  assert.throws(
    () => resolveWorkspaceVisualCanonMembership(selected, state.canon!, "forest", [selected, asset("file:///game-a", "assets/forest.png")]),
    /not an anchor/,
  );
});

test("unambiguous resolution preserves ordinary generation when no Canon membership exists", async () => {
  const noCanon = await loadWorkspaceVisualCanonForAsset(selected, { read: async () => undefined });
  assert.equal(resolveUnambiguousWorkspaceVisualCanon(selected, noCanon, [selected]), undefined);

  const unrelated = await loadWorkspaceVisualCanonForAsset(selected, {
    read: async () => JSON.stringify({
      schemaVersion: 1,
      entries: [{ id: "forest", kind: "environment", anchors: ["assets/forest.png"] }],
    }),
  });
  assert.equal(resolveUnambiguousWorkspaceVisualCanon(selected, unrelated, [selected]), undefined);
});

test("unambiguous resolution resolves the sole selected-asset membership", async () => {
  const state = await loadWorkspaceVisualCanonForAsset(selected, { read: async () => canonText });
  const resolved = resolveUnambiguousWorkspaceVisualCanon(selected, state, [
    selected,
    asset("file:///game-a", "assets/goblin_style.png"),
  ]);
  assert.equal(resolved?.entry.id, "goblin");
  assert.deepEqual(resolved?.context.constraints, ["moss-green palette"]);
});

test("unambiguous resolution fails closed when selected asset has multiple memberships", async () => {
  const state = await loadWorkspaceVisualCanonForAsset(selected, {
    read: async () => JSON.stringify({
      schemaVersion: 1,
      entries: [
        { id: "goblin", kind: "character", anchors: ["assets/goblin_idle.png"] },
        { id: "enemy-style", kind: "other", anchors: ["assets/goblin_idle.png"] },
      ],
    }),
  });
  assert.throws(
    () => resolveUnambiguousWorkspaceVisualCanon(selected, state, [selected]),
    (error: unknown) => error instanceof VisualCanonError
      && error.message.includes("multiple Visual Canon entries")
      && error.message.includes("goblin")
      && error.message.includes("enemy-style"),
  );
});

test("unambiguous resolution keeps missing anchors fail-closed and workspace-isolated", async () => {
  const state = await loadWorkspaceVisualCanonForAsset(selected, { read: async () => canonText });
  assert.throws(
    () => resolveUnambiguousWorkspaceVisualCanon(selected, state, [
      selected,
      asset("file:///game-b", "assets/goblin_style.png"),
    ]),
    (error: unknown) => error instanceof VisualCanonError && error.message.includes("goblin_style.png"),
  );
});
