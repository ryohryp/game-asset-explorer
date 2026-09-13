from pathlib import Path

p = Path("src/ui/assetGridPanel.ts")
text = p.read_text()

def replace(old: str, new: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f"pattern not found: {old[:120]!r}")
    text = text.replace(old, new, 1)

replace(
    'import { type FolderOrganizationReport } from "../core/folderOrganization";\n',
    'import { type FolderOrganizationReport } from "../core/folderOrganization";\nimport { deriveOrganizationNextActions } from "../core/organizationNextActions";\n',
)
replace(
    '  private viewMode: AssetViewMode = "grid";\n  private disposed = false;\n',
    '  private viewMode: AssetViewMode = "grid";\n  private organizationActionNotice: string | undefined;\n  private disposed = false;\n',
)
replace(
    '          const report = await this.onAnalyzeOrganization();\n          if (!this.disposed) {\n            await this.panel.webview.postMessage({ type: "organizationResult", report });\n          }\n',
    '          const report = await this.onAnalyzeOrganization();\n          const nextActions = deriveOrganizationNextActions(report);\n          this.organizationActionNotice = undefined;\n          if (!this.disposed) {\n            await this.panel.webview.postMessage({ type: "organizationResult", report, nextActions });\n          }\n',
)
replace(
    '          const assets = await this.onBulkAssignAssetType(message.workspaceFolderUri, message.folder, message.assetType);\n          if (!this.disposed) this.update(assets);\n',
    '          const assets = await this.onBulkAssignAssetType(message.workspaceFolderUri, message.folder, message.assetType);\n          if (!this.disposed) {\n            this.organizationActionNotice = "Asset Type assignment saved. Re-run Analyze Organization to verify the finding is resolved.";\n            this.update(assets);\n          }\n',
)
replace(
    '    this.panel.webview.html = getWebviewHtml(this.panel.webview, this.assets, this.assetProfile, this.viewMode);\n',
    '    this.panel.webview.html = getWebviewHtml(this.panel.webview, this.assets, this.assetProfile, this.viewMode, this.organizationActionNotice);\n',
)
replace(
    '  assetProfile: AssetProfile,\n  viewMode: AssetViewMode,\n): string {\n',
    '  assetProfile: AssetProfile,\n  viewMode: AssetViewMode,\n  organizationActionNotice?: string,\n): string {\n',
)
replace(
    '    .organization-summary { color: var(--vscode-descriptionForeground); margin-bottom: 10px; }\n',
    '    .organization-summary { color: var(--vscode-descriptionForeground); margin-bottom: 10px; }\n    .organization-action-notice { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; padding: 9px 10px; border: 1px solid var(--vscode-testing-iconPassed, var(--vscode-widget-border)); border-radius: 4px; background: var(--vscode-editor-inactiveSelectionBackground); }\n    .organization-next-actions { margin: 12px 0 16px; padding: 10px; border: 1px solid var(--vscode-widget-border); border-radius: 4px; background: var(--vscode-editor-background); }\n    .organization-next-actions > h3 { margin: 0 0 8px; font-size: 0.95rem; }\n    .organization-next-action { margin-top: 8px; padding: 9px 10px; border: 1px solid var(--vscode-widget-border); border-radius: 4px; }\n    .organization-next-action:first-of-type { margin-top: 0; }\n    .organization-next-action-title { margin-top: 5px; font-weight: 600; overflow-wrap: anywhere; }\n    .organization-next-action-badge { display: inline-block; padding: 2px 6px; border: 1px solid var(--vscode-widget-border); border-radius: 10px; color: var(--vscode-descriptionForeground); font-size: 0.76em; }\n    .organization-next-action-detail { margin-top: 5px; color: var(--vscode-descriptionForeground); font-size: 0.85em; overflow-wrap: anywhere; }\n',
)
replace(
    '  </div>\n  <div class="facets" aria-label="Asset filters">\n',
    '  </div>\n  ${organizationActionNotice ? `<div id="organization-action-notice" class="organization-action-notice"><span>${escapeHtml(organizationActionNotice)}</span><button id="verify-organization" class="secondary compact" type="button">Re-run Analyze Organization</button></div>` : ""}\n  <div class="facets" aria-label="Asset filters">\n',
)
replace(
    "    const analyzeOrganization = document.getElementById('analyze-organization');\n",
    "    const analyzeOrganization = document.getElementById('analyze-organization');\n    const verifyOrganization = document.getElementById('verify-organization');\n",
)
replace(
    "    analyzeOrganization.addEventListener('click', () => {\n      analyzeOrganization.disabled = true;\n      analyzeOrganization.textContent = 'Analyzing…';\n      vscode.postMessage({ type: 'analyzeOrganization' });\n    });\n",
    "    const runOrganizationAnalysis = () => {\n      analyzeOrganization.disabled = true;\n      analyzeOrganization.textContent = 'Analyzing…';\n      if (verifyOrganization) verifyOrganization.disabled = true;\n      vscode.postMessage({ type: 'analyzeOrganization' });\n    };\n    analyzeOrganization.addEventListener('click', runOrganizationAnalysis);\n    if (verifyOrganization) verifyOrganization.addEventListener('click', runOrganizationAnalysis);\n",
)
replace(
    "        renderOrganizationReport(message.report);\n",
    "        const notice = document.getElementById('organization-action-notice');\n        if (notice) notice.hidden = true;\n        renderOrganizationReport(message.report, message.nextActions);\n",
)
replace(
    '    function renderOrganizationReport(report) {\n',
    '    function renderOrganizationReport(report, nextActions) {\n',
)
marker = "      const promptStatus = statusNode('organization-prompt-status');\n      organizationReport.appendChild(promptStatus);\n\n      const renderFindingSection = (label, items, metadataSection) => {\n"
insert = """      const promptStatus = statusNode('organization-prompt-status');
      organizationReport.appendChild(promptStatus);

      const nextActionSection = document.createElement('section');
      nextActionSection.className = 'organization-next-actions';
      const nextActionHeading = document.createElement('h3');
      nextActionHeading.textContent = 'Recommended next actions';
      nextActionSection.appendChild(nextActionHeading);
      const actionable = nextActions && Array.isArray(nextActions.actionable) ? nextActions.actionable : [];
      const humanReviewCount = nextActions && Number.isFinite(nextActions.humanReviewCount) ? nextActions.humanReviewCount : 0;
      const lowConfidenceReviewCount = nextActions && Number.isFinite(nextActions.lowConfidenceReviewCount) ? nextActions.lowConfidenceReviewCount : 0;

      actionable.forEach((action) => {
        if (!action || action.kind !== 'bulk-assign-asset-type' || !Number.isFinite(action.assetCount) || action.assetCount <= 0) return;
        const card = document.createElement('div');
        card.className = 'organization-next-action';
        const badge = document.createElement('span');
        badge.className = 'organization-next-action-badge';
        badge.textContent = 'Actionable now';
        const title = document.createElement('div');
        title.className = 'organization-next-action-title';
        const folder = action.folder || '';
        title.textContent = action.assetCount + ' asset' + (action.assetCount === 1 ? '' : 's') + ' in ' + (folder || 'Workspace root') + ' are Uncategorized';
        const detail = document.createElement('div');
        detail.className = 'organization-next-action-detail';
        detail.textContent = 'Choose the Asset Type you accepted from the external AI review. Character metadata will remain unchanged.';
        const controls = document.createElement('div');
        controls.className = 'organization-bulk organization-bulk-controls';
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
        const apply = actionButton('Assign ' + action.assetCount + ' assets', false, () => {
          if (!select.value) return;
          select.disabled = true;
          apply.disabled = true;
          const status = document.getElementById('organization-prompt-status');
          if (status) status.textContent = 'Assigning ' + action.assetCount + ' assets in ' + (folder || 'Workspace root') + ' as ' + select.value + '…';
          vscode.postMessage({ type: 'bulkAssignAssetType', workspaceFolderUri: action.workspaceFolderUri, folder, assetType: select.value });
        });
        apply.disabled = true;
        select.addEventListener('change', () => { apply.disabled = !select.value; });
        controls.append(select, apply);
        const verify = document.createElement('div');
        verify.className = 'organization-next-action-detail';
        verify.textContent = 'After assignment: re-run Analyze Organization to verify this finding is resolved.';
        card.append(badge, title, detail, controls, verify);
        nextActionSection.appendChild(card);
      });

      if (humanReviewCount > 0) {
        const review = document.createElement('div');
        review.className = 'organization-next-action';
        const badge = document.createElement('span');
        badge.className = 'organization-next-action-badge';
        badge.textContent = 'Human review required';
        const detail = document.createElement('div');
        detail.className = 'organization-next-action-detail';
        detail.textContent = humanReviewCount + ' finding' + (humanReviewCount === 1 ? '' : 's') + ' have no safe built-in mutation. '
          + (lowConfidenceReviewCount > 0 ? lowConfidenceReviewCount + ' low-confidence folder finding' + (lowConfidenceReviewCount === 1 ? ' is' : 's are') + ' review-only; no automatic move is recommended.' : 'Review project context before taking any action.');
        review.append(badge, detail);
        nextActionSection.appendChild(review);
      }

      if (actionable.length === 0 && humanReviewCount === 0) {
        const none = document.createElement('div');
        none.className = 'organization-next-action';
        const badge = document.createElement('span');
        badge.className = 'organization-next-action-badge';
        badge.textContent = 'No action recommended';
        const detail = document.createElement('div');
        detail.className = 'organization-next-action-detail';
        detail.textContent = 'The current bounded analysis has no findings that require an in-product action.';
        none.append(badge, detail);
        nextActionSection.appendChild(none);
      }
      organizationReport.appendChild(nextActionSection);

      const renderFindingSection = (label, items, metadataSection) => {
"""
if marker not in text:
    raise SystemExit("next action insertion marker not found")
text = text.replace(marker, insert, 1)

start = text.index("          if (metadataSection && finding.kind === 'uncategorized-assets' && Array.isArray(finding.affectedFolders) && finding.affectedFolders.length === 1) {")
end = text.index("          list.appendChild(card);", start)
text = text[:start] + text[end:]

p.write_text(text)
