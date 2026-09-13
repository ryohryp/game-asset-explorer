import * as vscode from "vscode";
import {
  attachFolderIntentEvidence,
  detectFolderIntentEvidence,
  type FolderIntentEvidenceLocation,
} from "./core/folderIntentEvidence";
import type { FolderOrganizationReport } from "./core/folderOrganization";

export async function enrichOrganizationReportWithFolderIntent(
  report: FolderOrganizationReport,
): Promise<FolderOrganizationReport> {
  const locations: FolderIntentEvidenceLocation[] = [];
  const seen = new Set<string>();

  for (const finding of report.findings) {
    if (finding.kind !== "one-off-folder") continue;
    for (const folder of finding.affectedFolders) {
      const key = `${finding.workspaceFolderUri}\u0000${folder}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const workspaceUri = vscode.Uri.parse(finding.workspaceFolderUri);
      const segments = folder.replaceAll("\\", "/").split("/").filter(Boolean);
      const folderUri = vscode.Uri.joinPath(workspaceUri, ...segments);
      try {
        const entries = await vscode.workspace.fs.readDirectory(folderUri);
        const evidence = detectFolderIntentEvidence(entries.map(([name]) => name));
        if (evidence.length > 0) {
          locations.push({
            workspaceFolderUri: finding.workspaceFolderUri,
            folder,
            evidence,
          });
        }
      } catch {
        // Intent evidence is supplemental. An unreadable folder should not make analysis fail.
      }
    }
  }

  return attachFolderIntentEvidence(report, locations);
}
