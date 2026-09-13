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

test("requires concrete supported Game Asset Explorer next steps", () => {
  const assets = [
    asset("public/images/backgrounds/a.png"),
    asset("public/images/backgrounds/b.png"),
    asset("public/images/backgrounds/c.png"),
    asset("public/images/backgrounds/d.png"),
  ];
  const prompt = buildOrganizationPrompt(
    analyzeFolderOrganization(assets),
    assets,
    ["Character", "Background", "UI"],
  );

  assert.match(prompt, /Finish the review with a section titled exactly `Next actions in Game Asset Explorer`/);
  assert.match(prompt, /Supported Game Asset Explorer actions for this report:/);
  assert.match(prompt, /public\/images\/backgrounds: 4 Uncategorized assets can use the existing bulk Asset Type workflow/);
  assert.match(prompt, /Recommended next actions -> select the Asset Type you recommend from the Active Asset Profile -> click Assign 4 assets -> re-run Analyze Organization/);
  assert.match(prompt, /Character metadata remains unchanged/);
  assert.match(prompt, /Human review required/);
  assert.match(prompt, /No in-product action required/);
  assert.match(prompt, /Never invent buttons, commands, automatic moves, or metadata operations/);
  assert.match(prompt, /7\. Next actions in Game Asset Explorer/);
});

test("does not name a concrete Asset Type when no active profile types are supplied", () => {
  const assets = [
    asset("public/images/backgrounds/a.png"),
    asset("public/images/backgrounds/b.png"),
    asset("public/images/backgrounds/c.png"),
    asset("public/images/backgrounds/d.png"),
  ];
  const prompt = buildOrganizationPrompt(analyzeFolderOrganization(assets), assets);

  assert.match(prompt, /no Active Asset Profile types were supplied/);
  assert.match(prompt, /Do not name a concrete Asset Type; mark this as Human review required/);
});
