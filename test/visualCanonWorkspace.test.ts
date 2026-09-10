import assert from "node:assert/strict";
import test from "node:test";
import { VisualCanonError } from "../src/core/visualCanon";
import {
  loadWorkspaceVisualCanonForAsset,
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
