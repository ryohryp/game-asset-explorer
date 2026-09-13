import type { FolderOrganizationReport } from "./folderOrganization";
import { deriveOrganizationNextActions } from "./organizationNextActions";
import type { WorkspaceAsset } from "../workspaceAsset";

export const ORGANIZATION_PROMPT_ASSET_LIMIT = 200;

export function buildOrganizationPrompt(
  report: FolderOrganizationReport,
  assets: readonly WorkspaceAsset[],
  activeAssetTypes: readonly string[] = [],
): string {
  const sortedAssets = [...assets].sort((left, right) =>
    left.workspaceFolderName.localeCompare(right.workspaceFolderName)
    || left.asset.relativePath.localeCompare(right.asset.relativePath),
  );
  const includedAssets = sortedAssets.slice(0, ORGANIZATION_PROMPT_ASSET_LIMIT);
  const omittedCount = Math.max(0, sortedAssets.length - includedAssets.length);
  const nextActions = deriveOrganizationNextActions(report);

  const findingLines = report.findings.length === 0
    ? ["- No organization findings were detected by the current bounded rules."]
    : report.findings.flatMap((finding, index) => [
      `${index + 1}. ${finding.title}`,
      `   Workspace: ${finding.workspaceFolderName}`,
      `   Reason: ${finding.reason}`,
      ...(finding.severity ? [`   Severity: ${finding.severity}`] : []),
      ...(finding.confidence ? [`   Confidence: ${finding.confidence}`] : []),
      ...(finding.intentEvidence?.includes("readme") ? ["   Intent evidence: README present in affected folder"] : []),
      `   Folders: ${finding.affectedFolders.map((folder) => folder || "Workspace root").join(", ")}`,
      ...(finding.suggestedTargetFolder ? [`   Suggested target: ${finding.suggestedTargetFolder}`] : []),
      `   Affected assets: ${finding.affectedAssets.length}`,
    ]);

  const metadataFindingLines = report.metadataFindings.length === 0
    ? ["- No metadata hygiene findings were detected by the current bounded rules."]
    : report.metadataFindings.flatMap((finding, index) => [
      `${index + 1}. ${finding.title}`,
      `   Workspace: ${finding.workspaceFolderName}`,
      `   Reason: ${finding.reason}`,
      `   Folders: ${finding.affectedFolders.map((folder) => folder || "Workspace root").join(", ")}`,
      `   Affected assets: ${finding.affectedAssets.length}`,
    ]);

  const supportedActionLines = nextActions.actionable.length === 0
    ? ["- No supported Game Asset Explorer mutation action is available from the current report."]
    : nextActions.actionable.map((action) => {
      const folder = action.folder || "Workspace root";
      if (activeAssetTypes.length === 0) {
        return `- [${action.workspaceFolderName}] ${folder}: ${action.assetCount} Uncategorized assets are eligible for the existing bulk Asset Type workflow, but no Active Asset Profile types were supplied. Do not name a concrete Asset Type; mark this as Human review required.`;
      }
      return `- [${action.workspaceFolderName}] ${folder}: ${action.assetCount} Uncategorized assets can use the existing bulk Asset Type workflow: run Analyze Organization -> Recommended next actions -> select the Asset Type you recommend from the Active Asset Profile -> click Assign ${action.assetCount} assets -> re-run Analyze Organization to verify the finding is resolved. This bulk action changes Asset Type only; Character metadata remains unchanged.`;
    });

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
    "- Folder/path names are review evidence only; never treat them as authoritative semantic metadata.",
    "- Do not infer or recommend a concrete Asset Type unless it appears in the Active Asset Profile supplied below.",
    "- Do not infer a Character assignment solely from a folder name.",
    "- Existing explicit Asset Type / Character metadata may be used as evidence, but metadata improvements are suggestions that require explicit user review.",
    "- `Uncategorized` means no explicit Asset Type is assigned, and `Unassigned` means no explicit Character is assigned. These are display states, not literal metadata values to persist; if no Character assignment is appropriate, leave Character unset.",
    "- Do not invent global folder-to-type mapping rules unless they are supplied as explicit project conventions.",
    "- No project folder-to-type conventions are supplied in this prompt; do not invent any.",
    "- Minimize file moves and preserve existing conventions when they are already coherent.",
    "- It is valid for the recommended move count to be zero.",
    "- Do not propose a move merely to silence a static-analysis warning.",
    "- Prefer metadata correction over filesystem changes when the existing folder structure is semantically coherent.",
    "- Metadata Hygiene findings describe missing or inconsistent explicit metadata; they do not imply that files should be moved.",
    "- Avoid unnecessary folder depth and one-off folders.",
    "- Keep related assets together when the existing metadata provides a clear basis.",
    "- Flag uncertain recommendations instead of guessing.",
    "- Treat low-confidence findings as review candidates, not move recommendations.",
    "- Project documentation presence is contextual evidence, not authoritative semantic metadata; inspect it before recommending reorganization.",
    "- Do not assume references can be updated safely; call out when reference updates may be required.",
    "- Do not rename assets unless there is a concrete reason.",
    "- Finish the review with a section titled exactly `Next actions in Game Asset Explorer`.",
    "- In that final section, translate accepted recommendations into concrete steps using only the Supported Game Asset Explorer actions listed below.",
    "- The final `Next actions in Game Asset Explorer` section may reference only Folder Organization findings supplied below, Metadata Hygiene findings supplied below, and Supported Game Asset Explorer actions listed below.",
    "- The Asset summary is review evidence only; never promote an asset-summary-only observation into a next action unless a corresponding supplied finding or supported action exists.",
    "- Never invent buttons, commands, automatic moves, or metadata operations that are not listed as supported actions.",
    "- Do not add external development commands or workflows to or after the final section, including `npm test`, shell commands, CI steps, project-specific tests, code edits, or manual filesystem operations.",
    "- Do not append a generic verification or checklist section after `Next actions in Game Asset Explorer`; for a supported bulk Asset Type action, the in-product verification step is only to re-run Analyze Organization as listed below.",
    "- If a recommendation has no supported in-product action, write `Human review required` and explain what decision remains.",
    "- If an item should remain unchanged, write `No in-product action required` for that item.",
    "- If no supported Game Asset Explorer mutation action is available, explicitly state `No Game Asset Explorer action is currently available.` after classifying the supplied findings.",
    "- Keep every mutation explicit and user-triggered.",
    "",
    "For every proposed move, include:",
    "1. Current path",
    "2. Suggested target folder",
    "3. Reason",
    "4. Confidence: high / medium / low",
    "5. Risk notes",
    "6. Whether reference updates may be required",
    "",
    "Return recommendations in this priority:",
    "1. No-change recommendations — explicitly say when the current structure is already appropriate.",
    "2. Metadata improvements — prefer Asset Type / Character metadata fixes when they solve a finding without moving files.",
    "3. Recommended moves — include only moves you actually recommend; zero moves is valid.",
    "4. Rejected move ideas — briefly explain tempting changes that should NOT be made and why.",
    "5. Tool false positives / analyzer improvements — identify findings caused by intentional project conventions.",
    "6. Uncertain items requiring human review.",
    "7. Next actions in Game Asset Explorer — map only supplied findings to exact supported in-product steps; do not add actions from the asset summary alone or external development steps.",
    "",
    `Active Asset Profile types: ${activeAssetTypes.length > 0 ? activeAssetTypes.join(", ") : "(none supplied; do not recommend concrete Asset Types)"}`,
    "",
    "Supported Game Asset Explorer actions for this report:",
    ...supportedActionLines,
    ...(nextActions.humanReviewCount > 0 ? [`- ${nextActions.humanReviewCount} finding${nextActions.humanReviewCount === 1 ? "" : "s"} have no deterministic mutation action in this workflow; use Human review required or No in-product action required as appropriate.`] : []),
    "",
    `Folder Organization findings (${report.findings.length} across ${report.analyzedAssets} analyzed assets):`,
    ...findingLines,
    "",
    `Metadata Hygiene findings (${report.metadataFindings.length}):`,
    ...metadataFindingLines,
    "",
    `Asset summary (${includedAssets.length} shown${omittedCount > 0 ? `, ${omittedCount} omitted` : ""}):`,
    ...assetLines,
  ].join("\n");
}
