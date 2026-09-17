import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { findPotentiallyUnusedWorkspaceAssets } from "./assetHealthSearch";
import { findAssetProblems } from "./core/assetProblems";
import { buildAssetHealthDashboardCounts } from "./core/assetHealthDashboard";
import { findExactDuplicateAssets } from "./core/duplicateDetection";
import { parseGitImageStatus } from "./core/gitImageDiff";
import type { WorkspaceAsset } from "./workspaceAsset";

const execFileAsync = promisify(execFile);

export function registerAssetHealthDashboardCommand(getAssets: () => readonly WorkspaceAsset[]): vscode.Disposable {
  return vscode.commands.registerCommand("gameAssetExplorer.showAssetHealthDashboard", async () => {
    const assets = getAssets();
    const [unused, duplicates, problems, gitModified] = await Promise.all([
      findPotentiallyUnusedWorkspaceAssets(assets),
      findExactDuplicateAssets(assets),
      findAssetProblems(assets),
      countGitModifiedImages(),
    ]);
    const counts = buildAssetHealthDashboardCounts({ totalAssets: assets.length, gitModified, potentiallyUnused: unused.length, duplicateGroups: duplicates, problems: problems.length });
    const panel = vscode.window.createWebviewPanel("gameAssetExplorer.assetHealthDashboard", "Asset Health Dashboard", vscode.ViewColumn.One, { enableScripts: true });
    panel.webview.html = render(counts);
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      const action = message && typeof message === "object" ? (message as { action?: unknown }).action : undefined;
      if (action === "assets") await vscode.commands.executeCommand("gameAssetExplorer.openAssetGrid");
      if (action === "git") await vscode.commands.executeCommand("gameAssetExplorer.showGitImageDiff");
      if (action === "duplicates") await vscode.commands.executeCommand("gameAssetExplorer.showDuplicates");
      if (action === "problems") await vscode.commands.executeCommand("gameAssetExplorer.showAssetProblems");
      if (action === "unused") await showUnusedCandidates(unused);
    });
  });
}

async function countGitModifiedImages(): Promise<number> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const counts = await Promise.all(folders.map(async (folder) => {
    try {
      const { stdout } = await execFileAsync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: folder.uri.fsPath, encoding: "utf8", windowsHide: true });
      return parseGitImageStatus(stdout).length;
    } catch { return 0; }
  }));
  return counts.reduce((sum, count) => sum + count, 0);
}

async function showUnusedCandidates(assets: readonly WorkspaceAsset[]): Promise<void> {
  const selected = await vscode.window.showQuickPick(assets.map((asset) => ({ label: `$(file-media) ${asset.asset.relativePath}`, detail: asset.workspaceFolderName, asset })), {
    title: "Potentially Unused",
    placeHolder: "No direct static reference was found; dynamic references may exist.",
  });
  if (selected) await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(selected.asset.asset.absolutePath));
}

function render(counts: ReturnType<typeof buildAssetHealthDashboardCounts>): string {
  const cards = [["assets", "Total Assets", counts.totalAssets], ["git", "Git Modified", counts.gitModified], ["unused", "Potentially Unused", counts.potentiallyUnused], ["duplicates", "Duplicate Assets", counts.duplicateAssets], ["problems", "Problems", counts.problems]] as const;
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:var(--vscode-font-family);padding:20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}button{padding:18px;text-align:left;background:var(--vscode-editor-background);color:var(--vscode-foreground);border:1px solid var(--vscode-panel-border);cursor:pointer}.count{display:block;font-size:30px;font-weight:700;margin-bottom:6px}.label{color:var(--vscode-descriptionForeground)}</style></head><body><h1>Asset Health Dashboard</h1><div class="grid">${cards.map(([action,label,count]) => `<button data-action="${action}"><span class="count">${count}</span><span class="label">${label}</span></button>`).join("")}</div><script>const vscode=acquireVsCodeApi();document.addEventListener("click",e=>{const b=e.target.closest("button[data-action]");if(b)vscode.postMessage({action:b.dataset.action})})</script></body></html>`;
}
