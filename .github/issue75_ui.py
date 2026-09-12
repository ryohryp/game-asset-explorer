from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor not found: {path}")
    p.write_text(text.replace(old, new, 1))

p = "src/ui/assetGridPanel.ts"
replace_once(p, '  onCopyOrganizationPrompt: () => Promise<void>;\n', '  onCopyOrganizationPrompt: () => Promise<void>;\n  onBulkAssignAssetType: (workspaceFolderUri: string, folder: string, assetType: string) => Promise<WorkspaceAsset[]>;\n')
replace_once(p, '  private readonly onCopyOrganizationPrompt: () => Promise<void>;\n', '  private readonly onCopyOrganizationPrompt: () => Promise<void>;\n  private readonly onBulkAssignAssetType: (workspaceFolderUri: string, folder: string, assetType: string) => Promise<WorkspaceAsset[]>;\n')
replace_once(p, '    this.onCopyOrganizationPrompt = options.onCopyOrganizationPrompt;\n', '    this.onCopyOrganizationPrompt = options.onCopyOrganizationPrompt;\n    this.onBulkAssignAssetType = options.onBulkAssignAssetType;\n')
replace_once(p, '''      if (isCopyOrganizationPromptMessage(message)) {
        try {
          await this.onCopyOrganizationPrompt();
          if (!this.disposed) {
            await this.panel.webview.postMessage({ type: "organizationPromptCopied" });
          }
        } catch (error) {
          if (!this.disposed) {
            await this.panel.webview.postMessage({ type: "organizationPromptError", message: formatError(error) });
          }
        }
        return;
      }
''', '''      if (isCopyOrganizationPromptMessage(message)) {
        try {
          await this.onCopyOrganizationPrompt();
          if (!this.disposed) {
            await this.panel.webview.postMessage({ type: "organizationPromptCopied" });
          }
        } catch (error) {
          if (!this.disposed) {
            await this.panel.webview.postMessage({ type: "organizationPromptError", message: formatError(error) });
          }
        }
        return;
      }

      if (isBulkAssignAssetTypeMessage(message)) {
        try {
          const assets = await this.onBulkAssignAssetType(message.workspaceFolderUri, message.folder, message.assetType);
          if (!this.disposed) this.update(assets);
        } catch (error) {
          if (!this.disposed) await this.panel.webview.postMessage({ type: "organizationBulkAssetTypeError", message: formatError(error) });
        }
        return;
      }
''')
replace_once(p, '    .organization-assets { margin: 7px 0 0; padding-left: 20px; color: var(--vscode-descriptionForeground); font-size: 0.82em; }\n', '    .organization-assets { margin: 7px 0 0; padding-left: 20px; color: var(--vscode-descriptionForeground); font-size: 0.82em; }\n    .organization-bulk { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--vscode-widget-border); display: grid; gap: 7px; }\n    .organization-bulk-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }\n    .organization-bulk select { min-width: 160px; }\n')
replace_once(p, "      if (message.type === 'organizationPromptError') {\n        const button = document.getElementById('copy-organization-prompt');\n        if (button) button.disabled = false;\n        const status = document.getElementById('organization-prompt-status');\n        if (status) status.textContent = message.message || 'Unable to copy organization prompt.';\n        return;\n      }\n", "      if (message.type === 'organizationPromptError') {\n        const button = document.getElementById('copy-organization-prompt');\n        if (button) button.disabled = false;\n        const status = document.getElementById('organization-prompt-status');\n        if (status) status.textContent = message.message || 'Unable to copy organization prompt.';\n        return;\n      }\n\n      if (message.type === 'organizationBulkAssetTypeError') {\n        const status = document.getElementById('organization-prompt-status');\n        if (status) status.textContent = message.message || 'Unable to assign Asset Type.';\n        document.querySelectorAll('.organization-bulk button, .organization-bulk select').forEach((control) => { control.disabled = false; });\n        return;\n      }\n")
replace_once(p, '''        list.appendChild(card);
      });
''', '''        if (finding.kind === 'uncategorized-concentration' && Array.isArray(finding.affectedFolders) && finding.affectedFolders.length === 1) {
          const uncategorizedCount = Array.isArray(finding.affectedAssets) ? finding.affectedAssets.filter((asset) => !asset.assetType).length : 0;
          if (uncategorizedCount > 0 && Array.isArray(assetProfile.assetTypes) && assetProfile.assetTypes.length > 0) {
            const bulk = document.createElement('div');
            bulk.className = 'organization-bulk';
            const folder = finding.affectedFolders[0] || '';
            const explanation = document.createElement('div');
            explanation.className = 'organization-reason';
            explanation.textContent = 'Metadata fix: assign an Asset Type to ' + uncategorizedCount + ' Uncategorized asset' + (uncategorizedCount === 1 ? '' : 's') + ' in ' + (folder || 'Workspace root') + ' · Workspace: ' + finding.workspaceFolderName + '. Existing typed assets are preserved.';
            const controls = document.createElement('div');
            controls.className = 'organization-bulk-controls';
            const select = document.createElement('select');
            select.className = 'facet-select';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'Choose Asset Type…';
            select.appendChild(placeholder);
            assetProfile.assetTypes.forEach((assetType) => {
              const option = document.createElement('option');
              option.value = assetType;
              option.textContent = assetType;
              select.appendChild(option);
            });
            const apply = actionButton('Assign ' + uncategorizedCount + ' assets', false, () => {
              if (!select.value) return;
              select.disabled = true;
              apply.disabled = true;
              const status = document.getElementById('organization-prompt-status');
              if (status) status.textContent = 'Assigning ' + uncategorizedCount + ' assets in ' + (folder || 'Workspace root') + ' as ' + select.value + '…';
              vscode.postMessage({ type: 'bulkAssignAssetType', workspaceFolderUri: finding.workspaceFolderUri, folder, assetType: select.value });
            });
            apply.disabled = true;
            select.addEventListener('change', () => { apply.disabled = !select.value; });
            controls.append(select, apply);
            bulk.append(explanation, controls);
            card.appendChild(bulk);
          }
        }
        list.appendChild(card);
      });
''')
replace_once(p, '''function isReadyMessage(message: unknown): message is { type: "ready" } {
''', '''function isBulkAssignAssetTypeMessage(message: unknown): message is { type: "bulkAssignAssetType"; workspaceFolderUri: string; folder: string; assetType: string } {
  return typeof message === "object" && message !== null
    && "type" in message && message.type === "bulkAssignAssetType"
    && "workspaceFolderUri" in message && typeof message.workspaceFolderUri === "string" && message.workspaceFolderUri.length <= 2048
    && "folder" in message && typeof message.folder === "string" && message.folder.length <= 1024
    && "assetType" in message && typeof message.assetType === "string" && message.assetType.length > 0 && message.assetType.length <= 64;
}

function isReadyMessage(message: unknown): message is { type: "ready" } {
''')
