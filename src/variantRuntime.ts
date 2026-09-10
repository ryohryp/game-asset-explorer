import * as path from "node:path";
import * as vscode from "vscode";
import {
  isSafeWorkspaceRelativePath,
  normalizeWorkspacePath,
  type GenerationPackage,
} from "./core/generationPackage";
import { startVariantReviewSession, type VariantReviewSession } from "./core/variantReviewSession";
import {
  OpenAiImageGenerationProvider,
  type ReferenceImageData,
} from "./providers/openAiImageGenerationProvider";
import { getGenerationValidationContext } from "./variantRuntimeState";
import { type WorkspaceAsset } from "./workspaceAsset";

export const OPENAI_API_KEY_SECRET = "gameAssetExplorer.openAiApiKey";

export async function storeOpenAiApiKey(context: vscode.ExtensionContext): Promise<boolean> {
  const value = await vscode.window.showInputBox({
    title: "Game Asset Explorer: OpenAI API Key",
    prompt: "Enter the OpenAI API key used for Generate Variant.",
    password: true,
    ignoreFocusOut: true,
  });
  if (value === undefined) {
    return false;
  }

  const apiKey = value.trim();
  if (!apiKey) {
    await vscode.window.showWarningMessage("Game Asset Explorer: API key was not changed because the value was empty.");
    return false;
  }

  await context.secrets.store(OPENAI_API_KEY_SECRET, apiKey);
  await vscode.window.showInformationMessage("Game Asset Explorer: OpenAI API key stored securely.");
  return true;
}

export async function startOpenAiVariantReview(
  context: vscode.ExtensionContext,
  selectedAsset: WorkspaceAsset,
  allAssets: readonly WorkspaceAsset[],
  generationPackage: GenerationPackage,
): Promise<VariantReviewSession> {
  const workspaceFolder = resolveWorkspaceFolder(selectedAsset);
  const apiKey = (await context.secrets.get(OPENAI_API_KEY_SECRET))?.trim();
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured. Run 'Game Asset Explorer: Set OpenAI API Key' first.");
  }

  const validationContext = getGenerationValidationContext(selectedAsset, allAssets);
  const provider = new OpenAiImageGenerationProvider({
    apiKey,
    loadReference: (relativePath) => loadReferenceImage(workspaceFolder, relativePath),
  });

  return startVariantReviewSession(provider, generationPackage, validationContext);
}

export async function approveVariantIntoWorkspace(
  session: VariantReviewSession,
  candidateId: string,
  selectedAsset: WorkspaceAsset,
  allAssets: readonly WorkspaceAsset[],
): Promise<void> {
  const workspaceFolder = resolveWorkspaceFolder(selectedAsset);
  const validationContext = getGenerationValidationContext(selectedAsset, allAssets);

  await session.approve(candidateId, {
    currentAssetPaths: validationContext.availableAssetPaths,
    writer: {
      write: async (relativePath, bytes) => {
        const normalized = assertSafeRelativePath(relativePath);
        const target = toWorkspaceUri(workspaceFolder, normalized);

        if (await uriExists(target)) {
          throw new Error("Generation output already exists; refusing to overwrite it.");
        }

        const parent = vscode.Uri.joinPath(target, "..");
        await vscode.workspace.fs.createDirectory(parent);
        if (await uriExists(target)) {
          throw new Error("Generation output appeared during approval; refusing to overwrite it.");
        }
        await vscode.workspace.fs.writeFile(target, bytes);
      },
    },
  });
}

function resolveWorkspaceFolder(selectedAsset: WorkspaceAsset): vscode.WorkspaceFolder {
  const workspaceFolder = vscode.workspace.workspaceFolders?.find(
    (folder) => folder.uri.toString() === selectedAsset.workspaceFolderUri,
  );
  if (!workspaceFolder) {
    throw new Error("Selected asset workspace is no longer available.");
  }
  return workspaceFolder;
}

async function loadReferenceImage(
  workspaceFolder: vscode.WorkspaceFolder,
  relativePath: string,
): Promise<ReferenceImageData> {
  const normalized = assertSafeRelativePath(relativePath);
  const uri = toWorkspaceUri(workspaceFolder, normalized);
  const bytes = await vscode.workspace.fs.readFile(uri);
  return {
    bytes,
    mediaType: mediaTypeForPath(normalized),
    fileName: path.posix.basename(normalized),
  };
}

function assertSafeRelativePath(relativePath: string): string {
  const normalized = normalizeWorkspacePath(relativePath);
  if (!isSafeWorkspaceRelativePath(normalized)) {
    throw new Error("Generation path must stay inside the selected workspace.");
  }
  return normalized;
}

function toWorkspaceUri(workspaceFolder: vscode.WorkspaceFolder, relativePath: string): vscode.Uri {
  return vscode.Uri.joinPath(workspaceFolder.uri, ...relativePath.split("/"));
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
      return false;
    }
    throw error;
  }
}

function mediaTypeForPath(relativePath: string): string {
  switch (path.posix.extname(relativePath).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    default: throw new Error("Approved Anchor must use a supported image format.");
  }
}
