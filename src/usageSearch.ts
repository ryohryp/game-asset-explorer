import * as path from "node:path";
import * as vscode from "vscode";
import { findAssetUsageMatches, getAssetUsageCandidates } from "./core/assetUsages";
import { WorkspaceAsset } from "./workspaceAsset";

export interface AssetUsage {
  sourcePath: string;
  uri: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  matchedText: string;
}

export interface WorkspaceTextFile {
  sourcePath: string;
  uri: vscode.Uri;
  text: string;
}

const TEXT_FILE_GLOB = "**/*.{ts,tsx,js,jsx,mjs,cjs,json,jsonc,yaml,yml,css,scss,less,html,htm,md,txt,xml,svg}";
const EXCLUDE_GLOB = "**/{node_modules,.git,dist,out,build,coverage}/**";
const MAX_TEXT_FILES = 5000;

export async function findWorkspaceAssetUsages(workspaceAsset: WorkspaceAsset): Promise<AssetUsage[]> {
  const workspaceFolder = getWorkspaceFolderForAsset(workspaceAsset);
  if (!workspaceFolder) {
    return [];
  }

  const files = await readWorkspaceTextFiles(workspaceFolder);
  return findAssetUsagesInTextFiles(workspaceAsset, files);
}

export function findAssetUsagesInTextFiles(
  workspaceAsset: WorkspaceAsset,
  files: readonly WorkspaceTextFile[],
): AssetUsage[] {
  const candidates = getAssetUsageCandidates(workspaceAsset.asset);
  const usages: AssetUsage[] = [];

  for (const file of files) {
    for (const match of findAssetUsageMatches(file.text, candidates)) {
      const start = offsetToPosition(file.text, match.startOffset);
      const end = offsetToPosition(file.text, match.endOffset);
      usages.push({
        sourcePath: file.sourcePath,
        uri: file.uri.toString(),
        line: start.line,
        character: start.character,
        endLine: end.line,
        endCharacter: end.character,
        matchedText: match.candidate,
      });
    }
  }

  return usages.sort(compareAssetUsages);
}

export function getWorkspaceFolderForAsset(workspaceAsset: WorkspaceAsset): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.find(
    (folder) => folder.uri.toString() === workspaceAsset.workspaceFolderUri,
  );
}

export async function readWorkspaceTextFiles(
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<WorkspaceTextFile[]> {
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, TEXT_FILE_GLOB),
    new vscode.RelativePattern(workspaceFolder, EXCLUDE_GLOB),
    MAX_TEXT_FILES,
  );
  const files: WorkspaceTextFile[] = [];

  for (const uri of uris) {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      files.push({
        sourcePath: toWorkspaceRelativePath(workspaceFolder, uri),
        uri,
        text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      });
    } catch {
      continue;
    }
  }

  return files;
}

export async function openAssetUsage(usage: AssetUsage): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(usage.uri));
  const editor = await vscode.window.showTextDocument(document, { preview: true });
  const selection = new vscode.Selection(
    usage.line,
    usage.character,
    usage.endLine,
    usage.endCharacter,
  );
  editor.selection = selection;
  editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

export function offsetToPosition(text: string, offset: number): { line: number; character: number } {
  let line = 0;
  let lineStart = 0;

  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }

  return { line, character: offset - lineStart };
}

function compareAssetUsages(left: AssetUsage, right: AssetUsage): number {
  return left.sourcePath.localeCompare(right.sourcePath)
    || left.line - right.line
    || left.character - right.character;
}

function toWorkspaceRelativePath(workspaceFolder: vscode.WorkspaceFolder, uri: vscode.Uri): string {
  return path.relative(workspaceFolder.uri.fsPath, uri.fsPath).split(path.sep).join("/");
}
