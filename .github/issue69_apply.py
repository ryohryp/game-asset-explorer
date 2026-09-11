from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


Path("src/core/folderOrganization.ts").write_text(r'''import type { WorkspaceAsset } from "../workspaceAsset";

export type FolderOrganizationFindingKind =
  | "scattered-character"
  | "mixed-asset-types"
  | "deep-nesting"
  | "one-off-folder"
  | "uncategorized-concentration";

export interface FolderOrganizationAssetRef {
  workspaceFolderUri: string;
  workspaceFolderName: string;
  relativePath: string;
  assetType?: string;
  character?: string;
}

export interface FolderOrganizationFinding {
  kind: FolderOrganizationFindingKind;
  workspaceFolderUri: string;
  workspaceFolderName: string;
  title: string;
  reason: string;
  affectedFolders: string[];
  affectedAssets: FolderOrganizationAssetRef[];
  suggestedTargetFolder?: string;
}

export interface FolderOrganizationReport {
  analyzedAssets: number;
  findings: FolderOrganizationFinding[];
  thresholds: {
    mixedFolderMinimumAssets: number;
    mixedFolderMinimumPerType: number;
    deepFolderMinimumDepth: number;
    oneOffFolderMinimumDepth: number;
    uncategorizedMinimumAssets: number;
    uncategorizedMinimumRatio: number;
  };
}

export const FOLDER_ORGANIZATION_THRESHOLDS = {
  mixedFolderMinimumAssets: 4,
  mixedFolderMinimumPerType: 2,
  deepFolderMinimumDepth: 5,
  oneOffFolderMinimumDepth: 3,
  uncategorizedMinimumAssets: 4,
  uncategorizedMinimumRatio: 0.75,
} as const;

export function analyzeFolderOrganization(assets: readonly WorkspaceAsset[]): FolderOrganizationReport {
  const findings: FolderOrganizationFinding[] = [];
  const byWorkspace = groupBy(assets, (asset) => asset.workspaceFolderUri);

  for (const workspaceAssets of byWorkspace.values()) {
    if (workspaceAssets.length === 0) continue;
    findings.push(...analyzeWorkspace(workspaceAssets));
  }

  findings.sort((left, right) =>
    left.workspaceFolderName.localeCompare(right.workspaceFolderName)
    || findingRank(left.kind) - findingRank(right.kind)
    || left.title.localeCompare(right.title),
  );

  return {
    analyzedAssets: assets.length,
    findings,
    thresholds: { ...FOLDER_ORGANIZATION_THRESHOLDS },
  };
}

function analyzeWorkspace(assets: readonly WorkspaceAsset[]): FolderOrganizationFinding[] {
  const findings: FolderOrganizationFinding[] = [];
  const workspaceFolderUri = assets[0].workspaceFolderUri;
  const workspaceFolderName = assets[0].workspaceFolderName;
  const byFolder = groupBy(assets, (asset) => folderOf(asset.asset.relativePath));

  const byCharacter = new Map<string, WorkspaceAsset[]>();
  for (const asset of assets) {
    if (!asset.character) continue;
    const list = byCharacter.get(asset.character) ?? [];
    list.push(asset);
    byCharacter.set(asset.character, list);
  }

  for (const [character, characterAssets] of byCharacter) {
    const folders = uniqueSorted(characterAssets.map((asset) => folderOf(asset.asset.relativePath)));
    if (folders.length < 2 || characterAssets.length < 2) continue;
    const types = uniqueSorted(characterAssets.map((asset) => asset.assetType).filter(isString));
    const target = suggestedCharacterTarget(characterAssets, character, types.length === 1 ? types[0] : undefined);
    findings.push({
      kind: "scattered-character",
      workspaceFolderUri,
      workspaceFolderName,
      title: `${character} is spread across ${folders.length} folders`,
      reason: `${characterAssets.length} assets explicitly assigned to ${character} are stored in multiple folders. Consolidating them may make character work easier.`,
      affectedFolders: folders,
      affectedAssets: characterAssets.map(toAssetRef).sort(compareAssetRef),
      ...(target ? { suggestedTargetFolder: target } : {}),
    });
  }

  for (const [folder, folderAssets] of byFolder) {
    const assignedTypes = folderAssets.map((asset) => asset.assetType).filter(isString);
    const typeCounts = countValues(assignedTypes);
    const significantTypes = [...typeCounts.entries()].filter(([, count]) => count >= FOLDER_ORGANIZATION_THRESHOLDS.mixedFolderMinimumPerType);
    if (
      folderAssets.length >= FOLDER_ORGANIZATION_THRESHOLDS.mixedFolderMinimumAssets
      && significantTypes.length >= 2
    ) {
      findings.push({
        kind: "mixed-asset-types",
        workspaceFolderUri,
        workspaceFolderName,
        title: `${displayFolder(folder)} mixes multiple Asset Types`,
        reason: `${folderAssets.length} assets are in this folder and at least ${FOLDER_ORGANIZATION_THRESHOLDS.mixedFolderMinimumPerType} assets belong to each of ${significantTypes.length} Asset Types (${significantTypes.map(([type, count]) => `${type}: ${count}`).join(", ")}).`,
        affectedFolders: [folder],
        affectedAssets: folderAssets.map(toAssetRef).sort(compareAssetRef),
      });
    }

    const uncategorized = folderAssets.filter((asset) => !asset.assetType);
    if (
      folderAssets.length >= FOLDER_ORGANIZATION_THRESHOLDS.uncategorizedMinimumAssets
      && uncategorized.length >= FOLDER_ORGANIZATION_THRESHOLDS.uncategorizedMinimumAssets
      && uncategorized.length / folderAssets.length >= FOLDER_ORGANIZATION_THRESHOLDS.uncategorizedMinimumRatio
    ) {
      findings.push({
        kind: "uncategorized-concentration",
        workspaceFolderUri,
        workspaceFolderName,
        title: `${displayFolder(folder)} has many Uncategorized assets`,
        reason: `${uncategorized.length} of ${folderAssets.length} assets (${Math.round(uncategorized.length / folderAssets.length * 100)}%) have no explicit Asset Type. They remain Uncategorized; no semantic type is inferred.`,
        affectedFolders: [folder],
        affectedAssets: uncategorized.map(toAssetRef).sort(compareAssetRef),
      });
    }

    const depth = folderDepth(folder);
    if (depth >= FOLDER_ORGANIZATION_THRESHOLDS.deepFolderMinimumDepth) {
      findings.push({
        kind: "deep-nesting",
        workspaceFolderUri,
        workspaceFolderName,
        title: `${displayFolder(folder)} is deeply nested`,
        reason: `This folder is ${depth} levels deep. The conservative warning threshold is ${FOLDER_ORGANIZATION_THRESHOLDS.deepFolderMinimumDepth} levels.`,
        affectedFolders: [folder],
        affectedAssets: folderAssets.map(toAssetRef).sort(compareAssetRef),
      });
    }
  }

  const folders = [...byFolder.keys()];
  for (const folder of folders) {
    const folderAssets = byFolder.get(folder) ?? [];
    const depth = folderDepth(folder);
    if (folderAssets.length !== 1 || depth < FOLDER_ORGANIZATION_THRESHOLDS.oneOffFolderMinimumDepth) continue;
    const parent = parentFolder(folder);
    const siblingFolders = folders.filter((candidate) => candidate !== folder && parentFolder(candidate) === parent);
    if (siblingFolders.length === 0) continue;
    findings.push({
      kind: "one-off-folder",
      workspaceFolderUri,
      workspaceFolderName,
      title: `${displayFolder(folder)} contains only one asset`,
      reason: `This leaf folder is ${depth} levels deep, contains one image asset, and has sibling folders. It may add navigation depth without much grouping value.`,
      affectedFolders: [folder],
      affectedAssets: folderAssets.map(toAssetRef),
    });
  }

  return findings;
}

function suggestedCharacterTarget(assets: readonly WorkspaceAsset[], character: string, assetType?: string): string | undefined {
  const roots = uniqueSorted(assets.map((asset) => firstSegment(asset.asset.relativePath)).filter(isString));
  if (roots.length !== 1) return undefined;
  const characterSegment = slugSegment(character);
  if (!characterSegment) return undefined;
  const base = `${roots[0]}/characters/${characterSegment}`;
  if (!assetType) return base;
  const typeSegment = slugSegment(assetType);
  return typeSegment ? `${base}/${typeSegment}` : base;
}

function folderOf(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length <= 1 ? "" : parts.slice(0, -1).join("/");
}

function firstSegment(relativePath: string): string | undefined {
  const parts = relativePath.replaceAll("\\", "/").split("/").filter(Boolean);
  return parts.length > 1 ? parts[0] : undefined;
}

function folderDepth(folder: string): number {
  return folder ? folder.split("/").filter(Boolean).length : 0;
}

function parentFolder(folder: string): string {
  const parts = folder.split("/").filter(Boolean);
  return parts.slice(0, -1).join("/");
}

function displayFolder(folder: string): string {
  return folder || "Workspace root";
}

function slugSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function toAssetRef(asset: WorkspaceAsset): FolderOrganizationAssetRef {
  return {
    workspaceFolderUri: asset.workspaceFolderUri,
    workspaceFolderName: asset.workspaceFolderName,
    relativePath: asset.asset.relativePath,
    ...(asset.assetType ? { assetType: asset.assetType } : {}),
    ...(asset.character ? { character: asset.character } : {}),
  };
}

function compareAssetRef(left: FolderOrganizationAssetRef, right: FolderOrganizationAssetRef): number {
  return left.relativePath.localeCompare(right.relativePath);
}

function groupBy<T>(values: readonly T[], keyOf: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function countValues(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function findingRank(kind: FolderOrganizationFindingKind): number {
  return ["scattered-character", "mixed-asset-types", "uncategorized-concentration", "deep-nesting", "one-off-folder"].indexOf(kind);
}
''')

Path("test/folderOrganization.test.ts").write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFolderOrganization } from "../src/core/folderOrganization";
import type { WorkspaceAsset } from "../src/workspaceAsset";

function asset(relativePath: string, options: { assetType?: string; character?: string } = {}): WorkspaceAsset {
  const fileName = relativePath.split("/").at(-1) ?? relativePath;
  return {
    workspaceFolderUri: "file:///game",
    workspaceFolderName: "game",
    asset: { absolutePath: `/game/${relativePath}`, relativePath, fileName, fileType: "png" },
    ...options,
  };
}

test("detects a character scattered across folders and suggests a character/type target", () => {
  const report = analyzeFolderOrganization([
    asset("assets/portraits/alice.png", { assetType: "Portrait", character: "Alice" }),
    asset("assets/ui/alice-icon.png", { assetType: "Portrait", character: "Alice" }),
  ]);
  const finding = report.findings.find((item) => item.kind === "scattered-character");
  assert.ok(finding);
  assert.deepEqual(finding.affectedFolders, ["assets/portraits", "assets/ui"]);
  assert.equal(finding.suggestedTargetFolder, "assets/characters/alice/portrait");
});

test("detects significant Asset Type mixing only at the bounded threshold", () => {
  const report = analyzeFolderOrganization([
    asset("assets/misc/a.png", { assetType: "Character" }),
    asset("assets/misc/b.png", { assetType: "Character" }),
    asset("assets/misc/c.png", { assetType: "Background" }),
    asset("assets/misc/d.png", { assetType: "Background" }),
  ]);
  assert.ok(report.findings.some((item) => item.kind === "mixed-asset-types"));

  const below = analyzeFolderOrganization([
    asset("assets/misc/a.png", { assetType: "Character" }),
    asset("assets/misc/b.png", { assetType: "Character" }),
    asset("assets/misc/c.png", { assetType: "Background" }),
  ]);
  assert.ok(!below.findings.some((item) => item.kind === "mixed-asset-types"));
});

test("flags conservative deep nesting and one-off leaf folders", () => {
  const report = analyzeFolderOrganization([
    asset("assets/characters/alice/poses/combat/attack.png"),
    asset("assets/characters/alice/poses/idle/idle.png"),
  ]);
  assert.ok(report.findings.some((item) => item.kind === "deep-nesting"));
  assert.ok(report.findings.some((item) => item.kind === "one-off-folder"));
});

test("reports Uncategorized concentration without inventing semantic metadata", () => {
  const report = analyzeFolderOrganization([
    asset("assets/misc/a.png"),
    asset("assets/misc/b.png"),
    asset("assets/misc/c.png"),
    asset("assets/misc/d.png"),
  ]);
  const finding = report.findings.find((item) => item.kind === "uncategorized-concentration");
  assert.ok(finding);
  assert.equal(finding.suggestedTargetFolder, undefined);
  assert.match(finding.reason, /no semantic type is inferred/i);
});

test("returns no findings for a small well-organized set", () => {
  const report = analyzeFolderOrganization([
    asset("assets/characters/alice.png", { assetType: "Character", character: "Alice" }),
    asset("assets/backgrounds/forest.png", { assetType: "Background" }),
  ]);
  assert.equal(report.analyzedAssets, 2);
  assert.deepEqual(report.findings, []);
});
''')

replace_once(
    "src/extension.ts",
    'import { loadAssetDetails } from "./core/assetDetails";\n',
    'import { loadAssetDetails } from "./core/assetDetails";\nimport { analyzeFolderOrganization } from "./core/folderOrganization";\n',
)
replace_once(
    "src/extension.ts",
    '      onSearch: (query) => filterWorkspaceAssets(discoveredAssets, query),\n',
    '      onSearch: (query) => filterWorkspaceAssets(discoveredAssets, query),\n      onAnalyzeOrganization: async () => analyzeFolderOrganization(discoveredAssets),\n',
)

replace_once(
    "src/ui/assetGridPanel.ts",
    'import { AssetDetails } from "../core/assetDetails";\n',
    'import { AssetDetails } from "../core/assetDetails";\nimport { type FolderOrganizationReport } from "../core/folderOrganization";\n',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    '  onSearch: (query: string) => WorkspaceAsset[];\n',
    '  onSearch: (query: string) => WorkspaceAsset[];\n  onAnalyzeOrganization: () => Promise<FolderOrganizationReport>;\n',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    '  private readonly onSearch: (query: string) => WorkspaceAsset[];\n',
    '  private readonly onSearch: (query: string) => WorkspaceAsset[];\n  private readonly onAnalyzeOrganization: () => Promise<FolderOrganizationReport>;\n',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    '    this.onSearch = options.onSearch;\n',
    '    this.onSearch = options.onSearch;\n    this.onAnalyzeOrganization = options.onAnalyzeOrganization;\n',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    '''      if (isRefreshMessage(message)) {
        const assets = await this.onRefresh();
        this.update(assets);
        return;
      }
''',
    '''      if (isRefreshMessage(message)) {
        const assets = await this.onRefresh();
        this.update(assets);
        return;
      }

      if (isAnalyzeOrganizationMessage(message)) {
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
)
replace_once(
    "src/ui/assetGridPanel.ts",
    '    .empty { min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--vscode-descriptionForeground); text-align: center; }\n',
    '''    .organization-report { margin-bottom: 16px; border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 14px; background: var(--vscode-sideBar-background); }
    .organization-report[hidden] { display: none; }
    .organization-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .organization-header h2 { margin: 0; font-size: 1.05rem; }
    .organization-header button { margin-left: auto; }
    .organization-summary { color: var(--vscode-descriptionForeground); margin-bottom: 10px; }
    .organization-findings { display: grid; gap: 10px; }
    .organization-finding { border: 1px solid var(--vscode-widget-border); border-radius: 4px; padding: 10px; background: var(--vscode-editor-background); }
    .organization-finding h3 { margin: 0 0 6px; font-size: 0.95rem; }
    .organization-reason, .organization-target, .organization-folders { margin-top: 6px; font-size: 0.85em; overflow-wrap: anywhere; }
    .organization-target { font-weight: 600; }
    .organization-assets { margin: 7px 0 0; padding-left: 20px; color: var(--vscode-descriptionForeground); font-size: 0.82em; }
    .empty { min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--vscode-descriptionForeground); text-align: center; }
''',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    '    <button id="refresh" type="button">Refresh</button>\n',
    '    <button id="analyze-organization" class="secondary" type="button">Analyze Organization</button>\n    <button id="refresh" type="button">Refresh</button>\n',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    '  ${body}\n  <script nonce="${nonce}">\n',
    '  <section id="organization-report" class="organization-report" hidden></section>\n  ${body}\n  <script nonce="${nonce}">\n',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "    const filterStatus = document.getElementById('filter-status');\n",
    "    const filterStatus = document.getElementById('filter-status');\n    const organizationReport = document.getElementById('organization-report');\n    const analyzeOrganization = document.getElementById('analyze-organization');\n",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));\n",
    "    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));\n    analyzeOrganization.addEventListener('click', () => {\n      analyzeOrganization.disabled = true;\n      analyzeOrganization.textContent = 'Analyzing…';\n      vscode.postMessage({ type: 'analyzeOrganization' });\n    });\n",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "      if (message.type === 'assetDetails') {\n",
    "      if (message.type === 'organizationResult') {\n        analyzeOrganization.disabled = false;\n        analyzeOrganization.textContent = 'Analyze Organization';\n        renderOrganizationReport(message.report);\n        return;\n      }\n\n      if (message.type === 'organizationError') {\n        analyzeOrganization.disabled = false;\n        analyzeOrganization.textContent = 'Analyze Organization';\n        renderOrganizationError(message.message || 'Organization analysis failed.');\n        return;\n      }\n\n      if (message.type === 'assetDetails') {\n",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "    function currentFacets() {\n",
    r'''    function renderOrganizationReport(report) {
      if (!organizationReport) return;
      organizationReport.hidden = false;
      organizationReport.replaceChildren();
      const header = document.createElement('div');
      header.className = 'organization-header';
      const heading = document.createElement('h2');
      heading.textContent = 'Folder Organization';
      const close = actionButton('Close', true, () => { organizationReport.hidden = true; });
      header.append(heading, close);
      organizationReport.appendChild(header);

      const findings = report && Array.isArray(report.findings) ? report.findings : [];
      const summary = document.createElement('div');
      summary.className = 'organization-summary';
      const analyzed = report && Number.isFinite(report.analyzedAssets) ? report.analyzedAssets : 0;
      summary.textContent = findings.length === 0
        ? 'No organization findings across ' + analyzed + ' analyzed assets.'
        : findings.length + ' finding' + (findings.length === 1 ? '' : 's') + ' across ' + analyzed + ' analyzed assets. Read-only: no files or metadata were changed.';
      organizationReport.appendChild(summary);
      if (findings.length === 0) return;

      const list = document.createElement('div');
      list.className = 'organization-findings';
      findings.forEach((finding) => {
        const card = document.createElement('article');
        card.className = 'organization-finding';
        const title = document.createElement('h3');
        title.textContent = finding.title || finding.kind || 'Organization finding';
        const reason = document.createElement('div');
        reason.className = 'organization-reason';
        reason.textContent = finding.reason || '';
        card.append(title, reason);
        if (Array.isArray(finding.affectedFolders) && finding.affectedFolders.length > 0) {
          const folders = document.createElement('div');
          folders.className = 'organization-folders';
          folders.textContent = 'Folders: ' + finding.affectedFolders.map((folder) => folder || 'Workspace root').join(', ');
          card.appendChild(folders);
        }
        if (finding.suggestedTargetFolder) {
          const target = document.createElement('div');
          target.className = 'organization-target';
          target.textContent = 'Suggested target: ' + finding.suggestedTargetFolder;
          card.appendChild(target);
        }
        if (Array.isArray(finding.affectedAssets) && finding.affectedAssets.length > 0) {
          const assets = document.createElement('ul');
          assets.className = 'organization-assets';
          finding.affectedAssets.slice(0, 12).forEach((asset) => {
            const item = document.createElement('li');
            const metadata = [asset.assetType ? 'Type: ' + asset.assetType : 'Uncategorized', asset.character ? 'Character: ' + asset.character : 'Unassigned'];
            item.textContent = asset.relativePath + ' · ' + metadata.join(' · ');
            assets.appendChild(item);
          });
          if (finding.affectedAssets.length > 12) {
            const more = document.createElement('li');
            more.textContent = '+' + (finding.affectedAssets.length - 12) + ' more assets';
            assets.appendChild(more);
          }
          card.appendChild(assets);
        }
        list.appendChild(card);
      });
      organizationReport.appendChild(list);
      organizationReport.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderOrganizationError(message) {
      if (!organizationReport) return;
      organizationReport.hidden = false;
      organizationReport.replaceChildren();
      const header = document.createElement('div');
      header.className = 'organization-header';
      const heading = document.createElement('h2');
      heading.textContent = 'Folder Organization';
      const close = actionButton('Close', true, () => { organizationReport.hidden = true; });
      header.append(heading, close);
      const error = document.createElement('div');
      error.className = 'missing';
      error.textContent = message;
      organizationReport.append(header, error);
    }

    function currentFacets() {
''',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    '''function isRefreshMessage(message: unknown): message is { type: "refresh" } {
  return typeof message === "object" && message !== null && "type" in message && message.type === "refresh";
}
''',
    '''function isRefreshMessage(message: unknown): message is { type: "refresh" } {
  return typeof message === "object" && message !== null && "type" in message && message.type === "refresh";
}

function isAnalyzeOrganizationMessage(message: unknown): message is { type: "analyzeOrganization" } {
  return typeof message === "object" && message !== null && "type" in message && message.type === "analyzeOrganization";
}
''',
)

readme = Path("README.md")
readme.write_text(readme.read_text() + r'''

## Folder organization analysis

Use **Analyze Organization** in the Asset Grid to run a read-only review of the current filesystem layout. The report highlights explainable signals such as characters spread across folders, significant Asset Type mixing, deep nesting, one-off leaf folders, and concentrations of Uncategorized assets. When Character / Asset Type metadata provides a clear basis, the report may suggest a target folder. Analysis never moves files, creates folders, changes metadata, or rewrites references.
''')
