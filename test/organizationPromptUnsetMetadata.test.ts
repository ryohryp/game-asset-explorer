import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFolderOrganization } from "../src/core/folderOrganization";
import { buildOrganizationPrompt } from "../src/core/organizationPrompt";
import type { WorkspaceAsset } from "../src/workspaceAsset";

function asset(relativePath: string): WorkspaceAsset {
  const fileName = relativePath.split("/").at(-1) ?? relativePath;
  return {
    workspaceFolderUri: "file:///Game",
    workspaceFolderName: "Game",
    asset: {
      absolutePath: `/tmp/${relativePath}`,
      relativePath,
      fileName,
      fileType: "png",
    },
  };
}

test("explains unset metadata display states without turning them into persisted values", () => {
  const assets = [asset("assets/backgrounds/room.png")];
  const prompt = buildOrganizationPrompt(analyzeFolderOrganization(assets), assets, ["Background"]);

  assert.match(prompt, /`Uncategorized` means no explicit Asset Type is assigned/);
  assert.match(prompt, /`Unassigned` means no explicit Character is assigned/);
  assert.match(prompt, /display states, not literal metadata values to persist/);
  assert.match(prompt, /if no Character assignment is appropriate, leave Character unset/);
  assert.match(prompt, /Type=Uncategorized/);
  assert.match(prompt, /Character=Unassigned/);
});
