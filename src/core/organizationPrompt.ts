import type { FolderOrganizationReport } from "./folderOrganization";
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
