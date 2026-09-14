import {
  localizeAssetTypeLabel,
  localizeCharacterLabel,
  localizeProfileLabel,
  type AssetGridUiStrings,
} from "./localization";

/**
 * Localizes the current monolithic Asset Grid Webview without changing the values
 * used by filters, metadata, messages, or project files. Keep this adapter limited
 * to presentation text; the existing Webview behavior remains authoritative.
 */
export function localizeAssetGridHtml(
  html: string,
  strings: AssetGridUiStrings,
  language: string,
): string {
  let localized = html.replace(
    '<html lang="en">',
    `<html lang="${escapeHtmlAttribute(language || "en")}">`,
  );

  const serializedStrings = serializeForScript(strings);
  localized = localized.replace(
    "const vscode = acquireVsCodeApi();",
    `const vscode = acquireVsCodeApi();\n    const ui = ${serializedStrings};\n    const localizeAssetType = (value) => value === 'Uncategorized' ? ui.uncategorized : (ui.assetTypeLabels[value] || value);\n    const localizeCharacter = (value) => value === 'Unassigned' ? ui.unassigned : value;\n    const localizeProfile = (value) => ui.profileLabels[value] || value;\n    const formatCount = (count, singular, plural) => count + ' ' + (count === 1 ? singular : plural);`,
  );

  localized = replaceAttribute(localized, "placeholder", "Search filename or path", strings.searchPlaceholder);
  localized = replaceAttribute(localized, "aria-label", "Search assets", strings.searchAssets);
  localized = replaceVisibleText(localized, "Analyze Organization", strings.analyzeOrganization);
  localized = replaceVisibleText(localized, "Refresh", strings.refresh);
  localized = replaceVisibleText(localized, "Re-run Analyze Organization", strings.rerunAnalyzeOrganization);
  localized = replaceVisibleText(localized, "Grid", strings.grid);
  localized = replaceVisibleText(localized, "Characters", strings.characters);
  localized = replaceVisibleText(localized, "Clear filters", strings.clearFilters);
  localized = localized.replace(
    '<span id="filter-status" class="filter-status">No facet filters</span>',
    `<span id="filter-status" class="filter-status">${escapeHtml(strings.noFacetFilters)}</span>`,
  );
  localized = localized.replace(
    /<div id="summary" class="summary">(\d+) image assets?<\/div>/,
    (_match, countText: string) => {
      const count = Number(countText);
      return `<div id="summary" class="summary">${count} ${escapeHtml(count === 1 ? strings.imageAsset : strings.imageAssets)}</div>`;
    },
  );
  localized = localized.replace(
    '<div class="empty"><strong>No image assets found.</strong><span>Configure <code>gameAssetExplorer.assetDirectories</code> and refresh.</span></div>',
    `<div class="empty"><strong>${escapeHtml(strings.noImageAssetsFound)}</strong><span>${escapeHtml(strings.configureDirectoriesAndRefresh).replace("gameAssetExplorer.assetDirectories", "<code>gameAssetExplorer.assetDirectories</code>")}</span></div>`,
  );

  localized = localized
    .replace('<label class="facet-label">View<select', `<label class="facet-label">${escapeHtml(strings.view)}<select`)
    .replace('<label class="facet-label">Folder<select', `<label class="facet-label">${escapeHtml(strings.folder)}<select`)
    .replace('<label class="facet-label">Asset Type<select', `<label class="facet-label">${escapeHtml(strings.assetType)}<select`)
    .replace('<label class="facet-label">Format<select', `<label class="facet-label">${escapeHtml(strings.format)}<select`)
    .replace('<label class="facet-label">Workspace<select', `<label class="facet-label">${escapeHtml(strings.workspace)}<select`)
    .replaceAll('<option value="">All</option>', `<option value="">${escapeHtml(strings.all)}</option>`);

  localized = localized.replace(
    /<span class="profile-status">Profile: ([^<]+)<\/span>/g,
    (_match, profileLabel: string) => `<span class="profile-status">${escapeHtml(strings.profile)}: ${escapeHtml(localizeProfileLabel(profileLabel, strings))}</span>`,
  );
  localized = localized.replace(
    /<div class="asset-type">([^<]+)<\/div>/g,
    (_match, assetType: string) => `<div class="asset-type">${escapeHtml(localizeAssetTypeLabel(assetType, strings))}</div>`,
  );
  localized = localized.replace(
    /<div class="character-name">Character: ([^<]+)<\/div>/g,
    (_match, character: string) => `<div class="character-name">${escapeHtml(strings.character)}: ${escapeHtml(localizeCharacterLabel(character, strings))}</div>`,
  );
  localized = localized.replaceAll(
    '<div class="broken">Preview unavailable</div>',
    `<div class="broken">${escapeHtml(strings.previewUnavailable)}</div>`,
  );
  localized = localized.replace(
    /(<option value="([^\"]+)">)([^<]+)( \(\d+\)<\/option>)/g,
    (_match, prefix: string, value: string, label: string, suffix: string) => {
      const translated = localizeAssetTypeLabel(label, strings);
      return `${prefix}${escapeHtml(translated)}${suffix}`;
    },
  );

  const scriptReplacements: ReadonlyArray<readonly [string, string]> = [
    ["analyzeOrganization.textContent = 'Analyzing…';", "analyzeOrganization.textContent = ui.analyzing;"],
    ["analyzeOrganization.textContent = 'Analyze Organization';", "analyzeOrganization.textContent = ui.analyzeOrganization;"],
    ["if (status) status.textContent = 'Organization prompt copied.';", "if (status) status.textContent = ui.organizationPromptCopied;"],
    ["if (status) status.textContent = message.message || 'Unable to copy organization prompt.';", "if (status) status.textContent = message.message || ui.unableCopyOrganizationPrompt;"],
    ["if (status) status.textContent = message.message || 'Unable to assign Asset Type.';", "if (status) status.textContent = message.message || ui.unableAssignAssetType;"],
    ["if (status) status.textContent = message.message || 'Unable to save asset type.';", "if (status) status.textContent = message.message || ui.unableSaveAssetType;"],
    ["if (status) status.textContent = message.message || 'Unable to save character.';", "if (status) status.textContent = message.message || ui.unableSaveCharacter;"],
    ["if (status) status.textContent = message.copied ? 'Path copied.' : 'Asset is no longer available.';", "if (status) status.textContent = message.copied ? ui.pathCopied : ui.assetNoLongerAvailable;"],
    ["heading.textContent = 'Folder Organization';", "heading.textContent = ui.folderOrganization;"],
    ["actionButton('Copy Organization Prompt', true", "actionButton(ui.copyOrganizationPrompt, true"],
    ["actionButton('Close', true", "actionButton(ui.close, true"],
    ["filterStatus.textContent = count === 0 ? 'No facet filters' : count + ' active filter' + (count === 1 ? '' : 's');", "filterStatus.textContent = count === 0 ? ui.noFacetFilters : count + ' ' + (count === 1 ? ui.activeFilter : ui.activeFilters);"],
    ["? total + ' image asset' + (total === 1 ? '' : 's')\n        : count + ' of ' + total + ' image assets';", "? formatCount(total, ui.imageAsset, ui.imageAssets)\n        : count + ' / ' + total + ' ' + ui.imageAssets;"],
    ["title.textContent = label;", "title.textContent = localizeCharacter(label);"],
    ["if (count) count.textContent = visibleCount + ' asset' + (visibleCount === 1 ? '' : 's');", "if (count) count.textContent = formatCount(visibleCount, ui.asset, ui.assets);"],
    ["heading.textContent = 'Asset unavailable';", "heading.textContent = ui.assetUnavailable;"],
    ["message.textContent = 'This asset no longer exists or is no longer in the current asset list. Refresh to rebuild from the filesystem.';", "message.textContent = ui.assetUnavailableMessage;"],
    ["addDetailRow('Path', asset.relativePath);", "addDetailRow(ui.path, asset.relativePath);"],
    ["addDetailRow('Workspace', result.workspaceAsset.workspaceFolderName);", "addDetailRow(ui.workspace, result.workspaceAsset.workspaceFolderName);"],
    ["addDetailRow('Format', asset.fileType.toUpperCase());", "addDetailRow(ui.format, asset.fileType.toUpperCase());"],
    ["addDetailRow('Size', formatBytes(result.details.sizeBytes));", "addDetailRow(ui.size, formatBytes(result.details.sizeBytes));"],
    ["addDetailRow('Modified', new Date(result.details.modifiedAt).toLocaleString());", "addDetailRow(ui.modified, new Date(result.details.modifiedAt).toLocaleString());"],
    ["actionButton('Copy Asset Path', false", "actionButton(ui.copyAssetPath, false"],
    ["actionButton('Find Usages', true", "actionButton(ui.findUsages, true"],
    ["if (status) status.textContent = 'Searching workspace…';", "if (status) status.textContent = ui.searchingWorkspace;"],
    ["actionButton('Check Asset Health', true", "actionButton(ui.checkAssetHealth, true"],
    ["if (status) status.textContent = 'Checking direct workspace references…';", "if (status) status.textContent = ui.checkingDirectReferences;"],
    ["actionButton('Generate Variant', false", "actionButton(ui.generateVariant, false"],
    ["addDetailRow('Visual Canon', 'None');", "addDetailRow(ui.visualCanon, ui.none);"],
    ["addDetailRow('Visual Canon', 'No membership');", "addDetailRow(ui.visualCanon, ui.noMembership);"],
    ["addDetailRow('Lineage', 'None');", "addDetailRow(ui.lineage, ui.none);"],
    ["addDetailRow('Lineage', 'No recorded relationships');", "addDetailRow(ui.lineage, ui.noRecordedRelationships);"],
    ["'Sources',\n          sources.map", "ui.sources,\n          sources.map"],
    ["'Known Variants',\n          variants.map", "ui.knownVariants,\n          variants.map"],
    ["label.textContent = 'Asset Type · ' + assetProfile.label;", "label.textContent = ui.assetType + ' · ' + localizeProfile(assetProfile.label);"],
    ["uncategorized.textContent = 'Uncategorized';", "uncategorized.textContent = ui.uncategorized;"],
    ["option.textContent = assetType;", "option.textContent = localizeAssetType(assetType);"],
    ["if (status) status.textContent = 'Saving type…';", "if (status) status.textContent = ui.savingType;"],
    ["label.textContent = 'Character';", "label.textContent = ui.character;"],
    ["input.placeholder = 'Unassigned';", "input.placeholder = ui.unassigned;"],
    ["if (status) status.textContent = 'Saving character…';", "if (status) status.textContent = ui.savingCharacter;"],
    ["actionButton('Save Character', false", "actionButton(ui.saveCharacter, false"],
    ["actionButton('Clear', true", "actionButton(ui.clear, true"],
    ["suggestion.textContent = 'Suggested character: ' + suggestedCharacter;", "suggestion.textContent = ui.suggestedCharacter + ': ' + suggestedCharacter;"],
    ["actionButton('Use Suggestion', true", "actionButton(ui.useSuggestion, true"],
    ["? 'No text usages found in this workspace.'\n        : usages.length + ' usage' + (usages.length === 1 ? '' : 's') + ' found.';", "? ui.noTextUsages\n        : usages.length + ' ' + (usages.length === 1 ? ui.usageFound : ui.usagesFound);"],
    ["heading.textContent = 'Usages';", "heading.textContent = ui.usages;"],
    ["location.textContent = 'Line ' + (usage.line + 1) + ', column ' + (usage.character + 1) + ' · ' + usage.matchedText;", "location.textContent = ui.line + ' ' + (usage.line + 1) + ', ' + ui.column + ' ' + (usage.character + 1) + ' · ' + usage.matchedText;"],
    ["status.textContent = 'Asset is no longer available.';", "status.textContent = ui.assetNoLongerAvailable;"],
    ["? 'Referenced · ' + report.assetHealth.usageCount", "? ui.referenced + ' · ' + report.assetHealth.usageCount"],
    [": 'Unused Candidate · no direct workspace-relative path usages observed. Evidence: candidate, not proof of being unused.';", ": ui.unusedCandidate + ' · no direct workspace-relative path usages observed. Evidence: candidate, not proof of being unused.';"],
    ["heading.textContent = 'Missing References';", "heading.textContent = ui.missingReferences;"],
    ["none.textContent = 'No direct missing image references found in this workspace scan.';", "none.textContent = ui.noMissingReferences;"],
    ["target.textContent = finding.targetPath + ' · Missing Reference';", "target.textContent = finding.targetPath + ' · ' + ui.missingReference;"],
  ];

  for (const [source, target] of scriptReplacements) {
    localized = localized.replaceAll(source, target);
  }

  return localized;
}

function replaceVisibleText(html: string, source: string, target: string): string {
  return html.replaceAll(`>${source}<`, `>${escapeHtml(target)}<`);
}

function replaceAttribute(html: string, attribute: string, source: string, target: string): string {
  return html.replaceAll(`${attribute}="${source}"`, `${attribute}="${escapeHtmlAttribute(target)}"`);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
