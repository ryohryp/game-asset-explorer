import type { FolderOrganizationReport } from "./folderOrganization";

export interface BulkAssignAssetTypeNextAction {
  kind: "bulk-assign-asset-type";
  workspaceFolderUri: string;
  workspaceFolderName: string;
  folder: string;
  assetCount: number;
}

export interface OrganizationNextActions {
  actionable: BulkAssignAssetTypeNextAction[];
  humanReviewCount: number;
  lowConfidenceReviewCount: number;
}

export function deriveOrganizationNextActions(report: FolderOrganizationReport): OrganizationNextActions {
  const actionable: BulkAssignAssetTypeNextAction[] = [];
  let unsupportedMetadataFindings = 0;

  for (const finding of report.metadataFindings) {
    const assetCount = finding.affectedAssets.filter((asset) => !asset.assetType).length;
    if (
      finding.kind === "uncategorized-assets"
      && finding.affectedFolders.length === 1
      && assetCount > 0
    ) {
      actionable.push({
        kind: "bulk-assign-asset-type",
        workspaceFolderUri: finding.workspaceFolderUri,
        workspaceFolderName: finding.workspaceFolderName,
        folder: finding.affectedFolders[0] ?? "",
        assetCount,
      });
      continue;
    }
    unsupportedMetadataFindings += 1;
  }

  actionable.sort((left, right) =>
    left.workspaceFolderName.localeCompare(right.workspaceFolderName)
    || left.folder.localeCompare(right.folder),
  );

  return {
    actionable,
    humanReviewCount: report.findings.length + unsupportedMetadataFindings,
    lowConfidenceReviewCount: report.findings.filter((finding) => finding.confidence === "low").length,
  };
}
