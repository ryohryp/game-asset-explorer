import assert from "node:assert/strict";
import test from "node:test";
import { findNamingProblems } from "../src/core/namingProblems";
import type { WorkspaceAsset } from "../src/workspaceAsset";

function asset(fileName: string): WorkspaceAsset {
  return { workspaceFolderUri: "file:///workspace", workspaceFolderName: "workspace", asset: { absolutePath: `/workspace/${fileName}`, relativePath: `assets/${fileName}`, fileName, fileType: "png" } };
}

test("reports conservative naming problem candidates with explicit reasons", () => {
  const problems = findNamingProblems([asset("Player Idle.PNG"), asset("enemy-idle_alt.png"), asset("enemy-idle.png")]);
  assert.equal(problems.length, 2);
  assert.deepEqual(problems.find((p) => p.asset.asset.fileName === "Player Idle.PNG")?.reasons, ["Filename contains uppercase letters", "Extension contains uppercase letters", "Filename contains whitespace"]);
  assert.deepEqual(problems.find((p) => p.asset.asset.fileName === "enemy-idle_alt.png")?.reasons, ["Filename mixes underscore and hyphen separators"]);
});

test("does not flag a consistent lowercase filename", () => {
  assert.deepEqual(findNamingProblems([asset("enemy-idle.png")]), []);
});
