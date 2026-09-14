import * as path from "node:path";
import * as vscode from "vscode";
import {
  type GenerationAssetKind,
  type GenerationContext,
  type GenerationImageFormat,
} from "./core/generationPackage";
import { createNewAssetPrompt } from "./core/newAssetPrompt";
import { scanAssets } from "./core/assetScanner";
import { parseVisualCanon, VISUAL_CANON_PATH, type VisualCanonEntry } from "./core/visualCanon";

interface KindPick extends vscode.QuickPickItem {
  value: GenerationAssetKind;
}

interface FormatPick extends vscode.QuickPickItem {
  value: GenerationImageFormat;
  extension: string;
}

interface AlphaPick extends vscode.QuickPickItem {
  value: "allow" | "require" | "forbid";
}

interface Dimensions {
  width: number;
  height: number;
}

export function registerGenerateNewAssetPromptCommand(): vscode.Disposable {
  return vscode.commands.registerCommand("gameAssetExplorer.generateNewAssetPrompt", async () => {
    const workspaceFolder = await pickWorkspaceFolder();
    if (!workspaceFolder) {
      return;
    }

    const kind = await pickAssetKind();
    if (!kind) {
      return;
    }

    const request = await vscode.window.showInputBox({
      title: vscode.l10n.t("Generate New Asset · Describe the asset"),
      prompt: vscode.l10n.t("Describe the game image asset you want to create."),
      placeHolder: vscode.l10n.t("Example: A fire-element sword icon for an RPG equipment screen"),
      ignoreFocusOut: true,
      validateInput: (value) => value.trim().length > 0
        ? undefined
        : vscode.l10n.t("Describe the asset to generate."),
    });
    if (!request) {
      return;
    }

    const format = await pickFormat();
    if (!format) {
      return;
    }

    const dimensionsText = await vscode.window.showInputBox({
      title: vscode.l10n.t("Generate New Asset · Image size"),
      prompt: vscode.l10n.t("Enter width and height in pixels."),
      value: "1024x1024",
      placeHolder: "1024x1024",
      ignoreFocusOut: true,
      validateInput: (value) => parseDimensions(value)
        ? undefined
        : vscode.l10n.t("Use a positive WIDTHxHEIGHT value such as 1024x1024."),
    });
    if (!dimensionsText) {
      return;
    }
    const dimensions = parseDimensions(dimensionsText);
    if (!dimensions) {
      return;
    }

    const alpha = await pickAlpha(format.value);
    if (!alpha) {
      return;
    }

    const outputPath = await vscode.window.showInputBox({
      title: vscode.l10n.t("Generate New Asset · Project path"),
      prompt: vscode.l10n.t("Choose the workspace-relative path where you will save the generated image."),
      value: suggestOutputPath(workspaceFolder, kind.value, format.extension),
      placeHolder: `assets/${kind.value}/new-${kind.value}.${format.extension}`,
      ignoreFocusOut: true,
      validateInput: (value) => value.trim().length > 0
        ? undefined
        : vscode.l10n.t("Enter a workspace-relative output path."),
    });
    if (!outputPath) {
      return;
    }

    const context = await pickVisualCanonContext(workspaceFolder, kind.value);
    if (context === null) {
      return;
    }

    const configuration = vscode.workspace.getConfiguration("gameAssetExplorer", workspaceFolder.uri);
    const assetDirectories = configuration.get<string[]>("assetDirectories", []);
    const scanResult = await scanAssets({
      workspaceRoot: workspaceFolder.uri.fsPath,
      assetDirectories,
    });

    let result;
    try {
      result = createNewAssetPrompt({
        assetKind: kind.value,
        userRequest: request,
        output: {
          relativePath: outputPath,
          width: dimensions.width,
          height: dimensions.height,
          format: format.value,
          alpha: alpha.value,
        },
        ...(context ? { context } : {}),
      }, {
        availableAssetPaths: scanResult.assets.map((asset) => asset.relativePath),
      });
      await assertTargetDoesNotExist(workspaceFolder, result.generationPackage.output.relativePath);
    } catch (error) {
      await vscode.window.showErrorMessage(
        `Game Asset Explorer: ${vscode.l10n.t("Unable to prepare image prompt: {0}", formatError(error))}`,
      );
      return;
    }

    const copyPrompt = vscode.l10n.t("Copy Prompt");
    const action = await vscode.window.showInformationMessage(
      `Game Asset Explorer: ${vscode.l10n.t(
        "Image prompt is ready. After generation, save the image as {0}.",
        result.generationPackage.output.relativePath,
      )}`,
      copyPrompt,
    );
    if (action !== copyPrompt) {
      return;
    }

    await vscode.env.clipboard.writeText(result.prompt);
    await vscode.window.showInformationMessage(
      `Game Asset Explorer: ${vscode.l10n.t("Image-generation prompt copied to the clipboard.")}`,
    );
  });
}

async function pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    await vscode.window.showWarningMessage(
      `Game Asset Explorer: ${vscode.l10n.t("Open a workspace before generating an asset prompt.")}`,
    );
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0];
  }

  type WorkspacePick = vscode.QuickPickItem & { folder: vscode.WorkspaceFolder };
  const picked = await vscode.window.showQuickPick<WorkspacePick>(
    folders.map((folder) => ({
      label: folder.name,
      description: folder.uri.fsPath,
      folder,
    })),
    {
      title: vscode.l10n.t("Generate New Asset · Workspace"),
      placeHolder: vscode.l10n.t("Choose the workspace that will contain the new asset."),
    },
  );
  return picked?.folder;
}

async function pickAssetKind(): Promise<KindPick | undefined> {
  const values: GenerationAssetKind[] = ["character", "environment", "ui", "item", "effect", "other"];
  return vscode.window.showQuickPick<KindPick>(
    values.map((value) => ({
      label: vscode.l10n.t(kindLabel(value)),
      value,
    })),
    {
      title: vscode.l10n.t("Generate New Asset · Asset kind"),
      placeHolder: vscode.l10n.t("Choose what kind of game asset you are creating."),
    },
  );
}

async function pickFormat(): Promise<FormatPick | undefined> {
  return vscode.window.showQuickPick<FormatPick>([
    { label: "PNG", description: vscode.l10n.t("Supports transparency"), value: "png", extension: "png" },
    { label: "WebP", description: vscode.l10n.t("Supports transparency"), value: "webp", extension: "webp" },
    { label: "JPEG", description: vscode.l10n.t("Opaque image"), value: "jpeg", extension: "jpg" },
  ], {
    title: vscode.l10n.t("Generate New Asset · Image format"),
    placeHolder: vscode.l10n.t("Choose the output image format."),
  });
}

async function pickAlpha(format: GenerationImageFormat): Promise<AlphaPick | undefined> {
  const choices: AlphaPick[] = format === "jpg" || format === "jpeg"
    ? [{ label: vscode.l10n.t("Opaque / no transparency"), value: "forbid" }]
    : [
      { label: vscode.l10n.t("Transparent background required"), value: "require" },
      { label: vscode.l10n.t("Transparency allowed"), value: "allow" },
      { label: vscode.l10n.t("Opaque / no transparency"), value: "forbid" },
    ];
  return vscode.window.showQuickPick<AlphaPick>(choices, {
    title: vscode.l10n.t("Generate New Asset · Transparency"),
    placeHolder: vscode.l10n.t("Choose the transparency requirement."),
  });
}

async function pickVisualCanonContext(
  workspaceFolder: vscode.WorkspaceFolder,
  kind: GenerationAssetKind,
): Promise<GenerationContext | undefined | null> {
  const canonUri = vscode.Uri.joinPath(workspaceFolder.uri, VISUAL_CANON_PATH);
  let entries: VisualCanonEntry[] = [];
  try {
    const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(canonUri));
    entries = parseVisualCanon(text).entries.filter((entry) => entry.kind === kind);
  } catch (error) {
    if (!isFileNotFound(error)) {
      await vscode.window.showWarningMessage(
        `Game Asset Explorer: ${vscode.l10n.t("Visual Canon could not be used: {0}", formatError(error))}`,
      );
    }
  }

  if (entries.length === 0) {
    return undefined;
  }

  type CanonPick = vscode.QuickPickItem & { entry?: VisualCanonEntry };
  const picked = await vscode.window.showQuickPick<CanonPick>([
    {
      label: vscode.l10n.t("No Visual Canon"),
      description: vscode.l10n.t("Generate only from the request and technical constraints"),
    },
    ...entries.map((entry) => ({
      label: entry.id,
      description: vscode.l10n.t("Use this Visual Canon entry's constraints"),
      entry,
    })),
  ], {
    title: vscode.l10n.t("Generate New Asset · Visual Canon"),
    placeHolder: vscode.l10n.t("Optionally apply an existing project Visual Canon entry."),
  });
  if (!picked) {
    return null;
  }
  if (!picked.entry) {
    return undefined;
  }

  return {
    subjectId: picked.entry.id,
    ...(picked.entry.constraints?.length ? { constraints: [...picked.entry.constraints] } : {}),
    ...(picked.entry.forbidden?.length ? { forbidden: [...picked.entry.forbidden] } : {}),
  };
}

function suggestOutputPath(
  workspaceFolder: vscode.WorkspaceFolder,
  kind: GenerationAssetKind,
  extension: string,
): string {
  const directories = vscode.workspace
    .getConfiguration("gameAssetExplorer", workspaceFolder.uri)
    .get<string[]>("assetDirectories", []);
  const root = directories
    .map((value) => value.trim())
    .find((value) => value.length > 0 && !path.isAbsolute(value) && !value.startsWith(".."));
  const normalizedRoot = root?.replaceAll("\\", "/").replace(/\/+$/, "");
  const prefix = normalizedRoot ? `${normalizedRoot}/` : "";
  return `${prefix}${kind}/new-${kind}.${extension}`;
}

function parseDimensions(value: string): Dimensions | undefined {
  const match = /^\s*(\d+)\s*[xX×]\s*(\d+)\s*$/.exec(value);
  if (!match) {
    return undefined;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  return { width, height };
}

async function assertTargetDoesNotExist(
  workspaceFolder: vscode.WorkspaceFolder,
  relativePath: string,
): Promise<void> {
  const targetUri = vscode.Uri.joinPath(workspaceFolder.uri, ...relativePath.split("/"));
  try {
    await vscode.workspace.fs.stat(targetUri);
  } catch (error) {
    if (isFileNotFound(error)) {
      return;
    }
    throw error;
  }
  throw new Error("The output path already exists. Choose a new filename instead of overwriting it.");
}

function kindLabel(kind: GenerationAssetKind): string {
  switch (kind) {
    case "character": return "Character";
    case "environment": return "Environment";
    case "ui": return "UI";
    case "item": return "Item";
    case "effect": return "Effect";
    case "other": return "Other";
  }
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "FileNotFound";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
