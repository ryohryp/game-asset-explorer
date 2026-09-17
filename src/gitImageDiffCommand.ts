import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { parseGitImageStatus, type GitImageChange } from "./core/gitImageDiff";

const execFileAsync = promisify(execFile);

type WorkspaceGitImageChange = GitImageChange & { workspaceFolder: vscode.WorkspaceFolder };

export function registerGitImageDiffCommand(): vscode.Disposable {
  return vscode.commands.registerCommand("gameAssetExplorer.showGitImageDiff", async () => {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const changes = (await Promise.all(folders.map(readWorkspaceChanges))).flat();
    if (changes.length === 0) {
      await vscode.window.showInformationMessage(`Game Asset Explorer: ${vscode.l10n.t("No changed images found.")}`);
      return;
    }

    const selected = await vscode.window.showQuickPick(
      changes.map((change) => ({
        label: `$(file-media) ${change.relativePath}`,
        description: vscode.l10n.t(change.kind === "added" ? "Added" : change.kind === "deleted" ? "Deleted" : "Modified"),
        detail: folders.length > 1 ? change.workspaceFolder.name : undefined,
        change,
      })),
      { title: vscode.l10n.t("Git Image Diff"), placeHolder: vscode.l10n.t("Select a changed image to compare") },
    );
    if (!selected) return;
    await showImageDiff(selected.change);
  });
}

async function readWorkspaceChanges(workspaceFolder: vscode.WorkspaceFolder): Promise<WorkspaceGitImageChange[]> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain", "--untracked-files=all"], {
      cwd: workspaceFolder.uri.fsPath,
      encoding: "utf8",
      windowsHide: true,
    });
    return parseGitImageStatus(stdout).map((change) => ({ ...change, workspaceFolder }));
  } catch {
    return [];
  }
}

async function showImageDiff(change: WorkspaceGitImageChange): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    "gameAssetExplorer.gitImageDiff",
    `${vscode.l10n.t("Git Image Diff")} · ${path.basename(change.relativePath)}`,
    vscode.ViewColumn.Active,
    { localResourceRoots: [change.workspaceFolder.uri] },
  );
  const before = change.kind === "added" ? undefined : await readHeadImage(change);
  const after = change.kind === "deleted"
    ? undefined
    : panel.webview.asWebviewUri(vscode.Uri.joinPath(change.workspaceFolder.uri, ...change.relativePath.split("/"))).toString();
  panel.webview.html = renderDiffHtml(change, before, after);
}

async function readHeadImage(change: WorkspaceGitImageChange): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["show", `HEAD:${change.relativePath}`], {
      cwd: change.workspaceFolder.uri.fsPath,
      encoding: "buffer",
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    });
    const extension = path.extname(change.relativePath).slice(1).toLowerCase();
    const mime = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
    return `data:${mime};base64,${stdout.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function renderDiffHtml(change: WorkspaceGitImageChange, before?: string, after?: string): string {
  const image = (uri: string | undefined, empty: string) => uri
    ? `<img src="${escapeHtml(uri)}" alt="">`
    : `<div class="empty">${escapeHtml(empty)}</div>`;
  return `<!doctype html><html><head><meta charset="UTF-8"><style>
    body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:16px} h2{font-size:14px;font-weight:600}
    .meta{margin-bottom:16px;color:var(--vscode-descriptionForeground)} .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .pane{min-width:0}.frame{height:65vh;display:flex;align-items:center;justify-content:center;background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border)}
    img{max-width:100%;max-height:100%;object-fit:contain;image-rendering:auto}.empty{color:var(--vscode-descriptionForeground)}
  </style></head><body><div class="meta">${escapeHtml(change.relativePath)} · ${escapeHtml(change.kind)}</div><div class="grid">
    <section class="pane"><h2>HEAD</h2><div class="frame">${image(before, change.kind === "added" ? "Not present in HEAD" : "Unable to load HEAD image")}</div></section>
    <section class="pane"><h2>Working Tree</h2><div class="frame">${image(after, change.kind === "deleted" ? "Deleted from Working Tree" : "Unable to load Working Tree image")}</div></section>
  </div></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
