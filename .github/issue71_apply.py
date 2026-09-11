from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


Path("src/core/organizationPrompt.ts").write_text(r'''import type { FolderOrganizationReport } from "./folderOrganization";
import type { WorkspaceAsset } from "../workspaceAsset";

export const ORGANIZATION_PROMPT_ASSET_LIMIT = 200;

export function buildOrganizationPrompt(
  report: FolderOrganizationReport,
  assets: readonly WorkspaceAsset[],
): string {
  const sortedAssets = [...assets].sort((left, right) =>
    left.workspaceFolderName.localeCompare(right.workspaceFolderName)
    || left.asset.relativePath.localeCompare(right.asset.relativePath),
  );
  const includedAssets = sortedAssets.slice(0, ORGANIZATION_PROMPT_ASSET_LIMIT);
  const omittedCount = Math.max(0, sortedAssets.length - includedAssets.length);

  const findingLines = report.findings.length === 0
    ? ["- No organization findings were detected by the current bounded rules."]
    : report.findings.flatMap((finding, index) => [
      `${index + 1}. ${finding.title}`,
      `   Workspace: ${finding.workspaceFolderName}`,
      `   Reason: ${finding.reason}`,
      `   Folders: ${finding.affectedFolders.map((folder) => folder || "Workspace root").join(", ")}`,
      ...(finding.suggestedTargetFolder ? [`   Suggested target: ${finding.suggestedTargetFolder}`] : []),
      `   Affected assets: ${finding.affectedAssets.length}`,
    ]);

  const assetLines = includedAssets.map((asset) => {
    const metadata = [
      asset.assetType ? `Type=${asset.assetType}` : "Type=Uncategorized",
      asset.character ? `Character=${asset.character}` : "Character=Unassigned",
    ];
    return `- [${asset.workspaceFolderName}] ${asset.asset.relativePath} | ${metadata.join(" | ")}`;
  });
  if (omittedCount > 0) assetLines.push(`- ... ${omittedCount} additional assets omitted from this bounded summary`);

  return [
    "You are reviewing the image asset folder structure of a game project.",
    "",
    "Goal:",
    "Propose a safer, easier-to-navigate folder organization without changing files automatically.",
    "",
    "Rules:",
    "- Treat the current filesystem as authoritative.",
    "- Do not invent Asset Type or Character classifications. Use only the explicit metadata shown below.",
    "- Minimize file moves and preserve existing conventions when they are already coherent.",
    "- Avoid unnecessary folder depth and one-off folders.",
    "- Keep related assets together when the existing metadata provides a clear basis.",
    "- Flag uncertain recommendations instead of guessing.",
    "- Do not assume references can be updated safely; call out when reference updates may be required.",
    "- Do not rename assets unless there is a concrete reason.",
    "",
    "For every proposed move, include:",
    "1. Current path",
    "2. Suggested target folder",
    "3. Reason",
    "4. Confidence: high / medium / low",
    "5. Risk notes",
    "6. Whether reference updates may be required",
    "",
    "Return:",
    "- Overall assessment",
    "- Proposed folder structure",
    "- Move candidates",
    "- Items that should remain unchanged",
    "- Uncertain items requiring human review",
    "",
    `Organization findings (${report.findings.length} across ${report.analyzedAssets} analyzed assets):`,
    ...findingLines,
    "",
    `Asset summary (${includedAssets.length} shown${omittedCount > 0 ? `, ${omittedCount} omitted` : ""}):`,
    ...assetLines,
  ].join("\n");
}
''')

replace_once(
    "src/extension.ts",
    'import { analyzeFolderOrganization } from "./core/folderOrganization";\n',
    'import { analyzeFolderOrganization } from "./core/folderOrganization";\nimport { buildOrganizationPrompt } from "./core/organizationPrompt";\n',
)
replace_once(
    "src/extension.ts",
    '      onAnalyzeOrganization: async () => analyzeFolderOrganization(discoveredAssets),\n',
    '      onAnalyzeOrganization: async () => analyzeFolderOrganization(discoveredAssets),\n      onCopyOrganizationPrompt: async () => {\n        const report = analyzeFolderOrganization(discoveredAssets);\n        await vscode.env.clipboard.writeText(buildOrganizationPrompt(report, discoveredAssets));\n      },\n',
)

replace_once(
    "src/ui/assetGridPanel.ts",
    '  onAnalyzeOrganization: () => Promise<FolderOrganizationReport>;\n',
    '  onAnalyzeOrganization: () => Promise<FolderOrganizationReport>;\n  onCopyOrganizationPrompt: () => Promise<void>;\n',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    '  private readonly onAnalyzeOrganization: () => Promise<FolderOrganizationReport>;\n',
    '  private readonly onAnalyzeOrganization: () => Promise<FolderOrganizationReport>;\n  private readonly onCopyOrganizationPrompt: () => Promise<void>;\n',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    '    this.onAnalyzeOrganization = options.onAnalyzeOrganization;\n',
    '    this.onAnalyzeOrganization = options.onAnalyzeOrganization;\n    this.onCopyOrganizationPrompt = options.onCopyOrganizationPrompt;\n',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    '''      if (isAnalyzeOrganizationMessage(message)) {
        try {
          const report = await this.onAnalyzeOrganization();
          if (!this.disposed) {
            await this.panel.webview.postMessage({ type: "organizationResult", report });
          }
        } catch (error) {
          if (!this.disposed) {
            await this.panel.webview.postMessage({ type: "organizationError", message: formatError(error) });
          }
        }
        return;
      }
''',
    '''      if (isAnalyzeOrganizationMessage(message)) {
        try {
          const report = await this.onAnalyzeOrganization();
          if (!this.disposed) {
            await this.panel.webview.postMessage({ type: "organizationResult", report });
          }
        } catch (error) {
          if (!this.disposed) {
            await this.panel.webview.postMessage({ type: "organizationError", message: formatError(error) });
          }
        }
        return;
      }

      if (isCopyOrganizationPromptMessage(message)) {
        try {
          await this.onCopyOrganizationPrompt();
          if (!this.disposed) {
            await this.panel.webview.postMessage({ type: "organizationPromptCopied" });
          }
        } catch (error) {
          if (!this.disposed) {
            await this.panel.webview.postMessage({ type: "organizationPromptError", message: formatError(error) });
          }
        }
        return;
      }
''',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "      const close = actionButton('Close', true, () => { organizationReport.hidden = true; });\n      header.append(heading, close);\n",
    "      const copyPrompt = actionButton('Copy Organization Prompt', true, () => {\n        copyPrompt.disabled = true;\n        vscode.postMessage({ type: 'copyOrganizationPrompt' });\n      });\n      copyPrompt.id = 'copy-organization-prompt';\n      const close = actionButton('Close', true, () => { organizationReport.hidden = true; });\n      header.append(heading, copyPrompt, close);\n",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "      organizationReport.appendChild(summary);\n      if (findings.length === 0) return;\n",
    "      organizationReport.appendChild(summary);\n      const promptStatus = statusNode('organization-prompt-status');\n      organizationReport.appendChild(promptStatus);\n      if (findings.length === 0) return;\n",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "      if (message.type === 'organizationError') {\n        analyzeOrganization.disabled = false;\n        analyzeOrganization.textContent = 'Analyze Organization';\n        renderOrganizationError(message.message || 'Organization analysis failed.');\n        return;\n      }\n",
    "      if (message.type === 'organizationError') {\n        analyzeOrganization.disabled = false;\n        analyzeOrganization.textContent = 'Analyze Organization';\n        renderOrganizationError(message.message || 'Organization analysis failed.');\n        return;\n      }\n\n      if (message.type === 'organizationPromptCopied') {\n        const button = document.getElementById('copy-organization-prompt');\n        if (button) button.disabled = false;\n        const status = document.getElementById('organization-prompt-status');\n        if (status) status.textContent = 'Organization prompt copied.';\n        return;\n      }\n\n      if (message.type === 'organizationPromptError') {\n        const button = document.getElementById('copy-organization-prompt');\n        if (button) button.disabled = false;\n        const status = document.getElementById('organization-prompt-status');\n        if (status) status.textContent = message.message || 'Unable to copy organization prompt.';\n        return;\n      }\n",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    '''function isReadyMessage(message: unknown): message is { type: "ready" } {
''',
    '''function isCopyOrganizationPromptMessage(message: unknown): message is { type: "copyOrganizationPrompt" } {
  return typeof message === "object" && message !== null && "type" in message && message.type === "copyOrganizationPrompt";
}

function isReadyMessage(message: unknown): message is { type: "ready" } {
''',
)

Path("test/organizationPrompt.test.ts").write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFolderOrganization } from "../src/core/folderOrganization";
import { buildOrganizationPrompt, ORGANIZATION_PROMPT_ASSET_LIMIT } from "../src/core/organizationPrompt";
import type { WorkspaceAsset } from "../src/workspaceAsset";

function asset(relativePath: string, options: { assetType?: string; character?: string; workspace?: string } = {}): WorkspaceAsset {
  const workspace = options.workspace ?? "Game";
  const fileName = relativePath.split("/").at(-1) ?? relativePath;
  return {
    workspaceFolderUri: `file:///${workspace}`,
    workspaceFolderName: workspace,
    asset: { absolutePath: `/tmp/${relativePath}`, relativePath, fileName, fileType: "png" },
    ...(options.assetType ? { assetType: options.assetType } : {}),
    ...(options.character ? { character: options.character } : {}),
  };
}

test("builds deterministic organization prompt from findings and explicit metadata", () => {
  const assets = [
    asset("assets/ui/alice.png", { assetType: "Icon", character: "Alice" }),
    asset("assets/portraits/alice.png", { assetType: "Icon", character: "Alice" }),
    asset("assets/misc/unknown.png"),
  ];
  const report = analyzeFolderOrganization(assets);
  const first = buildOrganizationPrompt(report, assets);
  const second = buildOrganizationPrompt(report, [...assets].reverse());
  assert.equal(first, second);
  assert.match(first, /Do not invent Asset Type or Character classifications/);
  assert.match(first, /Confidence: high \/ medium \/ low/);
  assert.match(first, /Character=Alice/);
  assert.match(first, /Type=Uncategorized/);
});

test("bounds the asset summary", () => {
  const assets = Array.from({ length: ORGANIZATION_PROMPT_ASSET_LIMIT + 7 }, (_, index) => asset(`assets/icon-${String(index).padStart(3, "0")}.png`));
  const prompt = buildOrganizationPrompt(analyzeFolderOrganization(assets), assets);
  assert.match(prompt, /7 additional assets omitted/);
  assert.doesNotMatch(prompt, /icon-206\.png/);
});

test("handles a no-finding report without inventing advice", () => {
  const assets = [asset("assets/characters/alice.png", { assetType: "Character", character: "Alice" })];
  const prompt = buildOrganizationPrompt(analyzeFolderOrganization(assets), assets);
  assert.match(prompt, /No organization findings were detected/);
  assert.match(prompt, /Items that should remain unchanged/);
});
''')
