import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFolderOrganization } from "../src/core/folderOrganization";
import { buildOrganizationPrompt } from "../src/core/organizationPrompt";
import type { WorkspaceAsset } from "../src/workspaceAsset";

function asset(relativePath: string, assetType?: string): WorkspaceAsset {
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
    ...(assetType ? { assetType } : {}),
  };
}

test("bounds final next actions to supplied findings and supported Game Asset Explorer actions", () => {
  const assets = [
    asset("public/images/events/cg.png", "Background"),
    asset("public/images/backgrounds/day.png", "Background"),
    asset("public/images/backgrounds/night.png", "Background"),
  ];
  const prompt = buildOrganizationPrompt(analyzeFolderOrganization(assets), assets, ["Background"]);

  assert.match(prompt, /may reference only Folder Organization findings supplied below, Metadata Hygiene findings supplied below, and Supported Game Asset Explorer actions/);
  assert.match(prompt, /Asset summary is review evidence only; never promote an asset-summary-only observation into a next action/);
  assert.match(prompt, /Do not add external development commands or workflows to or after the final section/);
  assert.match(prompt, /`npm test`, shell commands, CI steps, project-specific tests, code edits, or manual filesystem operations/);
  assert.match(prompt, /Do not append a generic verification or checklist section after `Next actions in Game Asset Explorer`/);
  assert.match(prompt, /No Game Asset Explorer action is currently available/);
  assert.match(prompt, /No supported Game Asset Explorer mutation action is available from the current report/);
});

test("keeps the supported bulk Asset Type workflow while enforcing the action boundary", () => {
  const assets = [
    asset("public/images/backgrounds/a.png"),
    asset("public/images/backgrounds/b.png"),
    asset("public/images/backgrounds/c.png"),
    asset("public/images/backgrounds/d.png"),
  ];
  const prompt = buildOrganizationPrompt(analyzeFolderOrganization(assets), assets, ["Background"]);

  assert.match(prompt, /click Assign 4 assets -> re-run Analyze Organization/);
  assert.match(prompt, /Character metadata remains unchanged/);
  assert.match(prompt, /map only supplied findings to exact supported in-product steps/);
});
