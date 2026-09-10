import assert from "node:assert/strict";
import test from "node:test";
import { getGenerationValidationContext } from "../src/variantRuntimeState";
import { type WorkspaceAsset } from "../src/workspaceAsset";

function asset(workspaceFolderUri: string, relativePath: string): WorkspaceAsset {
  return {
    workspaceFolderUri,
    workspaceFolderName: workspaceFolderUri.split("/").at(-1) ?? "workspace",
    asset: {
      absolutePath: `/tmp/${relativePath}`,
      relativePath,
      fileName: relativePath.split("/").at(-1) ?? relativePath,
      fileType: "png",
    },
  };
}

test("generation validation context contains only assets from selected workspace", () => {
  const selected = asset("file:///workspace-a", "assets/hero.png");
  const context = getGenerationValidationContext(selected, [
    selected,
    asset("file:///workspace-a", "assets/hero_idle.png"),
    asset("file:///workspace-b", "assets/hero.png"),
  ]);

  assert.deepEqual(context.availableAssetPaths, ["assets/hero.png", "assets/hero_idle.png"]);
});
