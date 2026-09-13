import type {
  FolderOrganizationIntentEvidence,
  FolderOrganizationReport,
} from "./folderOrganization";

export interface FolderIntentEvidenceLocation {
  workspaceFolderUri: string;
  folder: string;
  evidence: readonly FolderOrganizationIntentEvidence[];
}

export function detectFolderIntentEvidence(fileNames: readonly string[]): FolderOrganizationIntentEvidence[] {
  return fileNames.some((name) => /^readme(?:\..+)?$/i.test(name)) ? ["readme"] : [];
}

export function attachFolderIntentEvidence(
  report: FolderOrganizationReport,
  locations: readonly FolderIntentEvidenceLocation[],
): FolderOrganizationReport {
  if (locations.length === 0) return report;

  return {
    ...report,
    findings: report.findings.map((finding) => {
      const evidence = new Set<FolderOrganizationIntentEvidence>(finding.intentEvidence ?? []);
      for (const location of locations) {
        if (location.workspaceFolderUri !== finding.workspaceFolderUri) continue;
        if (!finding.affectedFolders.includes(location.folder)) continue;
        for (const item of location.evidence) evidence.add(item);
      }
      return evidence.size > 0
        ? { ...finding, intentEvidence: [...evidence].sort() }
        : finding;
    }),
  };
}
