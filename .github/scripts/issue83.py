from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"pattern not found in {path}: {old[:80]!r}")
    p.write_text(text.replace(old, new, 1))


# Core type: evidence is descriptive only and does not alter finding confidence/severity.
replace(
    "src/core/folderOrganization.ts",
    'export type FolderOrganizationFindingSeverity = "info" | "warning";\n',
    'export type FolderOrganizationFindingSeverity = "info" | "warning";\nexport type FolderOrganizationIntentEvidence = "readme";\n',
)
replace(
    "src/core/folderOrganization.ts",
    '  severity?: FolderOrganizationFindingSeverity;\n',
    '  severity?: FolderOrganizationFindingSeverity;\n  intentEvidence?: FolderOrganizationIntentEvidence[];\n',
)

Path("src/core/folderIntentEvidence.ts").write_text('''import type {\n  FolderOrganizationIntentEvidence,\n  FolderOrganizationReport,\n} from "./folderOrganization";\n\nexport interface FolderIntentEvidenceLocation {\n  workspaceFolderUri: string;\n  folder: string;\n  evidence: readonly FolderOrganizationIntentEvidence[];\n}\n\nexport function detectFolderIntentEvidence(fileNames: readonly string[]): FolderOrganizationIntentEvidence[] {\n  return fileNames.some((name) => /^readme(?:\\..+)?$/i.test(name)) ? ["readme"] : [];\n}\n\nexport function attachFolderIntentEvidence(\n  report: FolderOrganizationReport,\n  locations: readonly FolderIntentEvidenceLocation[],\n): FolderOrganizationReport {\n  if (locations.length === 0) return report;\n\n  return {\n    ...report,\n    findings: report.findings.map((finding) => {\n      const evidence = new Set<FolderOrganizationIntentEvidence>(finding.intentEvidence ?? []);\n      for (const location of locations) {\n        if (location.workspaceFolderUri !== finding.workspaceFolderUri) continue;\n        if (!finding.affectedFolders.includes(location.folder)) continue;\n        for (const item of location.evidence) evidence.add(item);\n      }\n      return evidence.size > 0\n        ? { ...finding, intentEvidence: [...evidence].sort() }\n        : finding;\n    }),\n  };\n}\n''')

Path("src/organizationIntentWorkspace.ts").write_text('''import * as vscode from "vscode";\nimport {\n  attachFolderIntentEvidence,\n  detectFolderIntentEvidence,\n  type FolderIntentEvidenceLocation,\n} from "./core/folderIntentEvidence";\nimport type { FolderOrganizationReport } from "./core/folderOrganization";\n\nexport async function enrichOrganizationReportWithFolderIntent(\n  report: FolderOrganizationReport,\n): Promise<FolderOrganizationReport> {\n  const locations: FolderIntentEvidenceLocation[] = [];\n  const seen = new Set<string>();\n\n  for (const finding of report.findings) {\n    if (finding.kind !== "one-off-folder") continue;\n    for (const folder of finding.affectedFolders) {\n      const key = `${finding.workspaceFolderUri}\\u0000${folder}`;\n      if (seen.has(key)) continue;\n      seen.add(key);\n\n      const workspaceUri = vscode.Uri.parse(finding.workspaceFolderUri);\n      const segments = folder.replaceAll("\\\\", "/").split("/").filter(Boolean);\n      const folderUri = vscode.Uri.joinPath(workspaceUri, ...segments);\n      try {\n        const entries = await vscode.workspace.fs.readDirectory(folderUri);\n        const evidence = detectFolderIntentEvidence(entries.map(([name]) => name));\n        if (evidence.length > 0) {\n          locations.push({\n            workspaceFolderUri: finding.workspaceFolderUri,\n            folder,\n            evidence,\n          });\n        }\n      } catch {\n        // Intent evidence is supplemental. An unreadable folder should not make analysis fail.\n      }\n    }\n  }\n\n  return attachFolderIntentEvidence(report, locations);\n}\n''')

replace(
    "src/extension.ts",
    'import { buildOrganizationPrompt } from "./core/organizationPrompt";\n',
    'import { buildOrganizationPrompt } from "./core/organizationPrompt";\nimport { enrichOrganizationReportWithFolderIntent } from "./organizationIntentWorkspace";\n',
)
replace(
    "src/extension.ts",
    '      onAnalyzeOrganization: async () => analyzeFolderOrganization(discoveredAssets),\n      onCopyOrganizationPrompt: async () => {\n        const report = analyzeFolderOrganization(discoveredAssets);\n',
    '      onAnalyzeOrganization: async () => enrichOrganizationReportWithFolderIntent(analyzeFolderOrganization(discoveredAssets)),\n      onCopyOrganizationPrompt: async () => {\n        const report = await enrichOrganizationReportWithFolderIntent(analyzeFolderOrganization(discoveredAssets));\n',
)

replace(
    "src/core/organizationPrompt.ts",
    '      ...(finding.confidence ? [`   Confidence: ${finding.confidence}`] : []),\n      `   Folders: ${finding.affectedFolders.map((folder) => folder || "Workspace root").join(", ")}`,\n',
    '      ...(finding.confidence ? [`   Confidence: ${finding.confidence}`] : []),\n      ...(finding.intentEvidence?.includes("readme") ? ["   Intent evidence: README present in affected folder"] : []),\n      `   Folders: ${finding.affectedFolders.map((folder) => folder || "Workspace root").join(", ")}`,\n',
)
replace(
    "src/core/organizationPrompt.ts",
    '    "- Treat low-confidence findings as review candidates, not move recommendations.",\n',
    '    "- Treat low-confidence findings as review candidates, not move recommendations.",\n    "- Project documentation presence is contextual evidence, not authoritative semantic metadata; inspect it before recommending reorganization.",\n',
)

replace(
    "src/ui/assetGridPanel.ts",
    "          card.appendChild(reason);\n          if (Array.isArray(finding.affectedFolders) && finding.affectedFolders.length > 0) {\n",
    "          card.appendChild(reason);\n          if (!metadataSection && Array.isArray(finding.intentEvidence) && finding.intentEvidence.includes('readme')) {\n            const evidence = document.createElement('div');\n            evidence.className = 'organization-reason';\n            evidence.textContent = 'Intent evidence: README present';\n            card.appendChild(evidence);\n          }\n          if (Array.isArray(finding.affectedFolders) && finding.affectedFolders.length > 0) {\n",
)

Path("test/folderIntentEvidence.test.ts").write_text('''import assert from "node:assert/strict";\nimport test from "node:test";\nimport {\n  attachFolderIntentEvidence,\n  detectFolderIntentEvidence,\n} from "../src/core/folderIntentEvidence";\nimport { analyzeFolderOrganization } from "../src/core/folderOrganization";\nimport type { WorkspaceAsset } from "../src/workspaceAsset";\n\nfunction asset(relativePath: string): WorkspaceAsset {\n  const fileName = relativePath.split("/").at(-1) ?? relativePath;\n  return {\n    workspaceFolderUri: "file:///game",\n    workspaceFolderName: "game",\n    asset: { absolutePath: `/game/${relativePath}`, relativePath, fileName, fileType: "png" },\n  };\n}\n\ntest("detects README-like files case-insensitively", () => {\n  assert.deepEqual(detectFolderIntentEvidence(["image.png", "README.md"]), ["readme"]);\n  assert.deepEqual(detectFolderIntentEvidence(["readme.TXT"]), ["readme"]);\n  assert.deepEqual(detectFolderIntentEvidence(["README"]), ["readme"]);\n});\n\ntest("does not invent intent evidence when README-like files are absent", () => {\n  assert.deepEqual(detectFolderIntentEvidence(["notes.md", "image.png"]), []);\n});\n\ntest("attaches README evidence without suppressing a one-off finding", () => {\n  const report = analyzeFolderOrganization([\n    asset("assets/visual/events/cg.png"),\n    asset("assets/visual/misc/other.png"),\n  ]);\n  const oneOff = report.findings.find((finding) => finding.kind === "one-off-folder" && finding.affectedFolders.includes("assets/visual/events"));\n  assert.ok(oneOff);\n\n  const enriched = attachFolderIntentEvidence(report, [{\n    workspaceFolderUri: "file:///game",\n    folder: "assets/visual/events",\n    evidence: ["readme"],\n  }]);\n  const enrichedOneOff = enriched.findings.find((finding) => finding.kind === "one-off-folder" && finding.affectedFolders.includes("assets/visual/events"));\n  assert.ok(enrichedOneOff);\n  assert.deepEqual(enrichedOneOff.intentEvidence, ["readme"]);\n  assert.equal(enrichedOneOff.confidence, "low");\n  assert.equal(enrichedOneOff.severity, "info");\n  assert.equal(enriched.findings.length, report.findings.length);\n});\n''')

# Extend prompt test with an enriched one-off finding.
p = Path("test/organizationPrompt.test.ts")
text = p.read_text()
text = text.replace(
    'import { analyzeFolderOrganization } from "../src/core/folderOrganization";\n',
    'import { attachFolderIntentEvidence } from "../src/core/folderIntentEvidence";\nimport { analyzeFolderOrganization } from "../src/core/folderOrganization";\n',
    1,
)
text += '''\n\ntest("includes folder intent evidence as contextual, non-authoritative evidence", () => {\n  const assets = [\n    asset("assets/visual/events/cg.png"),\n    asset("assets/visual/misc/other.png"),\n  ];\n  const base = analyzeFolderOrganization(assets);\n  const report = attachFolderIntentEvidence(base, [{\n    workspaceFolderUri: "file:///Game",\n    folder: "assets/visual/events",\n    evidence: ["readme"],\n  }]);\n  const prompt = buildOrganizationPrompt(report, assets);\n  assert.match(prompt, /Intent evidence: README present in affected folder/);\n  assert.match(prompt, /Project documentation presence is contextual evidence, not authoritative semantic metadata/);\n});\n'''
p.write_text(text)
