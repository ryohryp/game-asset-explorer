import * as path from "node:path";
import * as vscode from "vscode";

export interface AssetDirectoryAvailability {
  hasWorkspace: boolean;
  hasUsableAssetDirectories: boolean;
}

export async function getAssetDirectoryAvailability(): Promise<AssetDirectoryAvailability> {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

  for (const workspaceFolder of workspaceFolders) {
    const configuration = vscode.workspace.getConfiguration("gameAssetExplorer", workspaceFolder.uri);
    const assetDirectories = configuration.get<string[]>("assetDirectories", []);

    for (const configuredDirectory of assetDirectories) {
      const trimmedDirectory = configuredDirectory.trim();
      if (!trimmedDirectory) {
        continue;
      }

      const resolvedPath = path.isAbsolute(trimmedDirectory)
        ? path.normalize(trimmedDirectory)
        : path.resolve(workspaceFolder.uri.fsPath, trimmedDirectory);

      try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(resolvedPath));
        if ((stat.type & vscode.FileType.Directory) !== 0) {
          return {
            hasWorkspace: true,
            hasUsableAssetDirectories: true,
          };
        }
      } catch {
        // Invalid or unreadable configured directories are treated as unavailable for first-run UX.
      }
    }
  }

  return {
    hasWorkspace: workspaceFolders.length > 0,
    hasUsableAssetDirectories: false,
  };
}

export async function updateAssetDirectoryContext(): Promise<AssetDirectoryAvailability> {
  const availability = await getAssetDirectoryAvailability();
  await Promise.all([
    vscode.commands.executeCommand("setContext", "gameAssetExplorer.hasWorkspace", availability.hasWorkspace),
    vscode.commands.executeCommand(
      "setContext",
      "gameAssetExplorer.hasUsableAssetDirectories",
      availability.hasUsableAssetDirectories,
    ),
  ]);
  return availability;
}

export async function configureAssetDirectories(): Promise<boolean> {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (workspaceFolders.length === 0) {
    await vscode.window.showWarningMessage("Game Asset Explorer: Open a workspace before configuring asset directories.");
    return false;
  }

  const selectedDirectories = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: true,
    defaultUri: workspaceFolders[0].uri,
    openLabel: "Use as Asset Directory",
    title: "Game Asset Explorer: Select Asset Directories",
  });

  if (!selectedDirectories || selectedDirectories.length === 0) {
    return false;
  }

  const selectedByWorkspace = new Map<string, {
    workspaceFolder: vscode.WorkspaceFolder;
    directories: Set<string>;
  }>();
  let skippedOutsideWorkspace = 0;

  for (const selectedDirectory of selectedDirectories) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(selectedDirectory);
    if (!workspaceFolder) {
      skippedOutsideWorkspace += 1;
      continue;
    }

    const relativeDirectory = path.relative(workspaceFolder.uri.fsPath, selectedDirectory.fsPath);
    if (
      relativeDirectory === ".."
      || relativeDirectory.startsWith(`..${path.sep}`)
      || path.isAbsolute(relativeDirectory)
    ) {
      skippedOutsideWorkspace += 1;
      continue;
    }

    const workspaceRelativeDirectory = relativeDirectory.length === 0
      ? "."
      : relativeDirectory.split(path.sep).join("/");
    const workspaceKey = workspaceFolder.uri.toString();
    const entry = selectedByWorkspace.get(workspaceKey) ?? {
      workspaceFolder,
      directories: new Set<string>(),
    };
    entry.directories.add(workspaceRelativeDirectory);
    selectedByWorkspace.set(workspaceKey, entry);
  }

  if (selectedByWorkspace.size === 0) {
    await vscode.window.showWarningMessage(
      "Game Asset Explorer: Select folders inside the currently opened workspace.",
    );
    return false;
  }

  let acceptedDirectoryCount = 0;
  for (const { workspaceFolder, directories } of selectedByWorkspace.values()) {
    const configuration = vscode.workspace.getConfiguration("gameAssetExplorer", workspaceFolder.uri);
    const currentDirectories = configuration.get<string[]>("assetDirectories", []);
    const nextDirectories = [...new Set([...currentDirectories, ...directories])];
    acceptedDirectoryCount += directories.size;
    await configuration.update(
      "assetDirectories",
      nextDirectories,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
  }

  const skippedSuffix = skippedOutsideWorkspace > 0
    ? ` ${skippedOutsideWorkspace} folder${skippedOutsideWorkspace === 1 ? " was" : "s were"} ignored because they are outside the workspace.`
    : "";
  await vscode.window.showInformationMessage(
    `Game Asset Explorer: Configured ${acceptedDirectoryCount} asset director${acceptedDirectoryCount === 1 ? "y" : "ies"}.${skippedSuffix}`,
  );
  return true;
}
