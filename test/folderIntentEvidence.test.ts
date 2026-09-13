import assert from "node:assert/strict";
import test from "node:test";
import {
  attachFolderIntentEvidence,
  detectFolderIntentEvidence,
} from "../src/core/folderIntentEvidence";
import { analyzeFolderOrganization } from "../src/core/folderOrganization";
import type { WorkspaceAsset } from "../src/workspaceAsset";

function asset(relativePath: string): WorkspaceAsset {
  const fileName = relativePath.split("/").at(-1) ?? relativePath;
  return {
    workspaceFolderUri: "file:///game",
    workspaceFolderName: "game",
    asset: { absolutePath: `/game/${relativePath}`, relativePath, fileName, fileType: "png" },
  };
}

test("detects README-like files case-insensitively", () => {
  assert.deepEqual(detectFolderIntentEvidence(["image.png", "README.md"]), ["readme"]);
  assert.deepEqual(detectFolderIntentEvidence(["readme.TXT"]), ["readme"]);
  assert.deepEqual(detectFolderIntentEvidence(["README"]), ["readme"]);
});

test("does not invent intent evidence when README-like files are absent", () => {
  assert.deepEqual(detectFolderIntentEvidence(["notes.md", "image.png"]), []);
});

test("attaches README evidence without suppressing a one-off finding", () => {
  const report = analyzeFolderOrganization([
    asset("assets/visual/events/cg.png"),
    asset("assets/visual/misc/other.png"),
  ]);
  const oneOff = report.findings.find((finding) => finding.kind === "one-off-folder" && finding.affectedFolders.includes("assets/visual/events"));
  assert.ok(oneOff);

  const enriched = attachFolderIntentEvidence(report, [{
    workspaceFolderUri: "file:///game",
    folder: "assets/visual/events",
    evidence: ["readme"],
  }]);
  const enrichedOneOff = enriched.findings.find((finding) => finding.kind === "one-off-folder" && finding.affectedFolders.includes("assets/visual/events"));
  assert.ok(enrichedOneOff);
  assert.deepEqual(enrichedOneOff.intentEvidence, ["readme"]);
  assert.equal(enrichedOneOff.confidence, "low");
  assert.equal(enrichedOneOff.severity, "info");
  assert.equal(enriched.findings.length, report.findings.length);
});
