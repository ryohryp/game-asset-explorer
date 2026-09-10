from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one anchor in {path}, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


def append_if_missing(path: str, marker: str, content: str) -> None:
    file = Path(path)
    text = file.read_text()
    if marker not in text:
        file.write_text(text.rstrip() + "\n\n" + content.strip() + "\n")


Path("src/core/assetTypeMetadata.ts").write_text(r'''import { isAssetTypeAllowed, type AssetProfile } from "./assetProfiles";
import { isSupportedAssetPath } from "./assetScanner";

export const ASSET_TYPE_METADATA_PATH = ".game-asset-explorer/asset-types.json";

export interface AssetTypeMetadataFile {
  schemaVersion: 1;
  assignments: Record<string, string>;
  characters?: Record<string, string>;
}

export class AssetTypeMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetTypeMetadataError";
  }
}

export function createEmptyAssetTypeMetadata(): AssetTypeMetadataFile {
  return { schemaVersion: 1, assignments: {} };
}

export function parseAssetTypeMetadata(text: string): AssetTypeMetadataFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AssetTypeMetadataError("Asset type metadata must be valid JSON.");
  }

  if (!isPlainObject(value) || value.schemaVersion !== 1 || !isPlainObject(value.assignments)) {
    throw new AssetTypeMetadataError("Asset type metadata must use schemaVersion 1 and an assignments object.");
  }
  if (value.characters !== undefined && !isPlainObject(value.characters)) {
    throw new AssetTypeMetadataError("Character metadata must be an object when present.");
  }

  const assignments: Record<string, string> = {};
  for (const [rawPath, rawType] of Object.entries(value.assignments)) {
    const relativePath = normalizeAssetPath(rawPath);
    validateMetadataAssetPath(relativePath, rawPath);
    if (typeof rawType !== "string") {
      throw new AssetTypeMetadataError(`Asset type for '${rawPath}' must be a string.`);
    }

    const assetType = rawType.trim();
    if (!assetType || assetType.length > 64) {
      throw new AssetTypeMetadataError(`Asset type for '${rawPath}' must be between 1 and 64 characters.`);
    }
    if (assignments[relativePath] !== undefined) {
      throw new AssetTypeMetadataError(`Duplicate normalized asset path '${relativePath}' in asset type metadata.`);
    }
    assignments[relativePath] = assetType;
  }

  const characters: Record<string, string> = {};
  const rawCharacters = value.characters;
  if (isPlainObject(rawCharacters)) {
    for (const [rawPath, rawCharacter] of Object.entries(rawCharacters)) {
      const relativePath = normalizeAssetPath(rawPath);
      validateMetadataAssetPath(relativePath, rawPath);
      if (typeof rawCharacter !== "string") {
        throw new AssetTypeMetadataError(`Character for '${rawPath}' must be a string.`);
      }
      if (characters[relativePath] !== undefined) {
        throw new AssetTypeMetadataError(`Duplicate normalized asset path '${relativePath}' in character metadata.`);
      }
      characters[relativePath] = normalizeCharacterName(rawCharacter);
    }
  }

  return {
    schemaVersion: 1,
    assignments,
    ...(Object.keys(characters).length > 0 ? { characters } : {}),
  };
}

export function serializeAssetTypeMetadata(metadata: AssetTypeMetadataFile): string {
  const assignments = sortRecord(metadata.assignments);
  const characters = sortRecord(metadata.characters ?? {});
  const payload = {
    schemaVersion: 1,
    assignments,
    ...(Object.keys(characters).length > 0 ? { characters } : {}),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function getAssetTypeAssignment(
  metadata: AssetTypeMetadataFile,
  relativePath: string,
  profile: AssetProfile,
): string | undefined {
  const assignedType = metadata.assignments[normalizeAssetPath(relativePath)];
  return assignedType && isAssetTypeAllowed(profile, assignedType) ? assignedType : undefined;
}

export function setAssetTypeAssignment(
  metadata: AssetTypeMetadataFile,
  relativePath: string,
  assetType: string | undefined,
  profile: AssetProfile,
): AssetTypeMetadataFile {
  const normalizedPath = normalizeAssetPath(relativePath);
  validateAssignmentPath(normalizedPath, "Asset type");
  if (assetType !== undefined && !isAssetTypeAllowed(profile, assetType)) {
    throw new AssetTypeMetadataError(`Asset type '${assetType}' is not available in the active ${profile.label} profile.`);
  }

  const assignments = { ...metadata.assignments };
  if (assetType === undefined) {
    delete assignments[normalizedPath];
  } else {
    assignments[normalizedPath] = assetType;
  }
  return { ...metadata, schemaVersion: 1, assignments };
}

export function getAssetCharacterAssignment(
  metadata: AssetTypeMetadataFile,
  relativePath: string,
): string | undefined {
  return metadata.characters?.[normalizeAssetPath(relativePath)];
}

export function setAssetCharacterAssignment(
  metadata: AssetTypeMetadataFile,
  relativePath: string,
  character: string | undefined,
): AssetTypeMetadataFile {
  const normalizedPath = normalizeAssetPath(relativePath);
  validateAssignmentPath(normalizedPath, "Character");
  const characters = { ...(metadata.characters ?? {}) };

  if (character === undefined) {
    delete characters[normalizedPath];
  } else {
    characters[normalizedPath] = normalizeCharacterName(character);
  }

  if (Object.keys(characters).length === 0) {
    const result: AssetTypeMetadataFile = {
      schemaVersion: 1,
      assignments: metadata.assignments,
    };
    return result;
  }
  return { ...metadata, schemaVersion: 1, characters };
}

export function normalizeCharacterName(value: string): string {
  const character = value.trim();
  if (!character || character.length > 64) {
    throw new AssetTypeMetadataError("Character names must be between 1 and 64 characters.");
  }
  if (/[\u0000-\u001f\u007f]/.test(character)) {
    throw new AssetTypeMetadataError("Character names must not contain control characters.");
  }
  return character;
}

function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function validateMetadataAssetPath(relativePath: string, rawPath: string): void {
  if (!isSafeWorkspaceRelativeAssetPath(relativePath) || !isSupportedAssetPath(relativePath)) {
    throw new AssetTypeMetadataError(`Invalid asset path '${rawPath}' in asset type metadata.`);
  }
}

function validateAssignmentPath(relativePath: string, label: string): void {
  if (!isSafeWorkspaceRelativeAssetPath(relativePath) || !isSupportedAssetPath(relativePath)) {
    throw new AssetTypeMetadataError(`${label} assignments require a supported workspace-relative image path.`);
  }
}

function normalizeAssetPath(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function isSafeWorkspaceRelativeAssetPath(value: string): boolean {
  if (!value || value.startsWith("/") || value.startsWith("\\") || /^[a-zA-Z]:[\\/]/.test(value)) {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) {
    return false;
  }
  return !value.split("/").some((segment) => !segment || segment === "." || segment === "..");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
''')

Path("src/assetTypeWorkspace.ts").write_text(r'''import {
  createEmptyAssetTypeMetadata,
  getAssetCharacterAssignment,
  getAssetTypeAssignment,
  parseAssetTypeMetadata,
  serializeAssetTypeMetadata,
  setAssetCharacterAssignment,
  setAssetTypeAssignment,
} from "./core/assetTypeMetadata";
import { type AssetProfile } from "./core/assetProfiles";
import { type WorkspaceAsset } from "./workspaceAsset";

export interface WorkspaceAssetTypeStore {
  read(workspaceFolderUri: string): Promise<string | undefined>;
  write(workspaceFolderUri: string, text: string): Promise<void>;
}

export async function loadWorkspaceAssetTypes(
  assets: readonly WorkspaceAsset[],
  profile: AssetProfile,
  store: WorkspaceAssetTypeStore,
): Promise<WorkspaceAsset[]> {
  if (assets.length === 0) {
    return [];
  }

  const workspaceUris = [...new Set(assets.map((asset) => asset.workspaceFolderUri))];
  const metadataByWorkspace = new Map<string, ReturnType<typeof createEmptyAssetTypeMetadata> | undefined>();

  for (const workspaceFolderUri of workspaceUris) {
    const text = await store.read(workspaceFolderUri);
    metadataByWorkspace.set(
      workspaceFolderUri,
      text === undefined ? undefined : parseAssetTypeMetadata(text),
    );
  }

  return assets.map((workspaceAsset) => {
    const metadata = metadataByWorkspace.get(workspaceAsset.workspaceFolderUri);
    const assetType = metadata
      ? getAssetTypeAssignment(metadata, workspaceAsset.asset.relativePath, profile)
      : undefined;
    const character = metadata
      ? getAssetCharacterAssignment(metadata, workspaceAsset.asset.relativePath)
      : undefined;
    return {
      workspaceFolderUri: workspaceAsset.workspaceFolderUri,
      workspaceFolderName: workspaceAsset.workspaceFolderName,
      asset: workspaceAsset.asset,
      ...(assetType ? { assetType } : {}),
      ...(character ? { character } : {}),
    };
  });
}

export async function updateWorkspaceAssetType(
  selectedAsset: WorkspaceAsset,
  assetType: string | undefined,
  profile: AssetProfile,
  store: WorkspaceAssetTypeStore,
): Promise<void> {
  const existingText = await store.read(selectedAsset.workspaceFolderUri);
  const metadata = existingText === undefined
    ? createEmptyAssetTypeMetadata()
    : parseAssetTypeMetadata(existingText);
  const updated = setAssetTypeAssignment(metadata, selectedAsset.asset.relativePath, assetType, profile);
  await store.write(selectedAsset.workspaceFolderUri, serializeAssetTypeMetadata(updated));
}

export async function updateWorkspaceAssetCharacter(
  selectedAsset: WorkspaceAsset,
  character: string | undefined,
  store: WorkspaceAssetTypeStore,
): Promise<void> {
  const existingText = await store.read(selectedAsset.workspaceFolderUri);
  const metadata = existingText === undefined
    ? createEmptyAssetTypeMetadata()
    : parseAssetTypeMetadata(existingText);
  const updated = setAssetCharacterAssignment(metadata, selectedAsset.asset.relativePath, character);
  await store.write(selectedAsset.workspaceFolderUri, serializeAssetTypeMetadata(updated));
}
''')

Path("src/core/assetCharacterGrouping.ts").write_text(r'''import { type WorkspaceAsset } from "../workspaceAsset";

export const UNASSIGNED_CHARACTER_LABEL = "Unassigned";

export interface CharacterAssetGroup {
  character?: string;
  label: string;
  assets: WorkspaceAsset[];
}

export function groupWorkspaceAssetsByCharacter(
  assets: readonly WorkspaceAsset[],
): CharacterAssetGroup[] {
  const assigned = new Map<string, WorkspaceAsset[]>();
  const unassigned: WorkspaceAsset[] = [];

  for (const asset of assets) {
    if (!asset.character) {
      unassigned.push(asset);
      continue;
    }
    const group = assigned.get(asset.character) ?? [];
    group.push(asset);
    assigned.set(asset.character, group);
  }

  const groups = [...assigned.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([character, groupedAssets]) => ({
      character,
      label: character,
      assets: groupedAssets,
    }));

  if (unassigned.length > 0) {
    groups.push({ label: UNASSIGNED_CHARACTER_LABEL, assets: unassigned });
  }
  return groups;
}

export function listCharacterNames(assets: readonly WorkspaceAsset[]): string[] {
  return [...new Set(assets.flatMap((asset) => asset.character ? [asset.character] : []))]
    .sort((left, right) => left.localeCompare(right));
}
''')

replace_once(
    "src/workspaceAsset.ts",
    "  assetType?: string;\n}",
    "  assetType?: string;\n  character?: string;\n}",
)

replace_once(
    "src/extension.ts",
    "  loadWorkspaceAssetTypes,\n  updateWorkspaceAssetType,\n  type WorkspaceAssetTypeStore,",
    "  loadWorkspaceAssetTypes,\n  updateWorkspaceAssetCharacter,\n  updateWorkspaceAssetType,\n  type WorkspaceAssetTypeStore,",
)
replace_once(
    "src/extension.ts",
    "      onCopyPath: async (identity) => {",
    '''      onSetCharacter: async (identity, character) => {
        const workspaceAsset = findAsset(identity);
        if (!workspaceAsset) {
          throw new Error("Selected asset is no longer available. Refresh and try again.");
        }

        await updateWorkspaceAssetCharacter(workspaceAsset, character, assetTypeStore);
        return scanAndStore(false);
      },
      onCopyPath: async (identity) => {''',
)

replace_once(
    "src/ui/assetGridPanel.ts",
    'import { AssetDetails } from "../core/assetDetails";\n',
    'import { AssetDetails } from "../core/assetDetails";\nimport { listCharacterNames, UNASSIGNED_CHARACTER_LABEL } from "../core/assetCharacterGrouping";\n',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "export interface AssetGridPanelOptions {\n",
    'type AssetViewMode = "grid" | "character";\n\nexport interface AssetGridPanelOptions {\n',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "  onSetAssetType: (identity: string, assetType: string | undefined) => Promise<WorkspaceAsset[]>;\n",
    "  onSetAssetType: (identity: string, assetType: string | undefined) => Promise<WorkspaceAsset[]>;\n  onSetCharacter: (identity: string, character: string | undefined) => Promise<WorkspaceAsset[]>;\n",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "  private readonly onSetAssetType: (identity: string, assetType: string | undefined) => Promise<WorkspaceAsset[]>;\n",
    "  private readonly onSetAssetType: (identity: string, assetType: string | undefined) => Promise<WorkspaceAsset[]>;\n  private readonly onSetCharacter: (identity: string, character: string | undefined) => Promise<WorkspaceAsset[]>;\n",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "  private facets: AssetFacetSelection = {};\n  private disposed = false;",
    '  private facets: AssetFacetSelection = {};\n  private viewMode: AssetViewMode = "grid";\n  private disposed = false;',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "    this.onSetAssetType = options.onSetAssetType;\n",
    "    this.onSetAssetType = options.onSetAssetType;\n    this.onSetCharacter = options.onSetCharacter;\n",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "      if (isScrollMessage(message)) {",
    '''      if (isViewModeMessage(message)) {
        this.viewMode = message.viewMode;
        return;
      }

      if (isScrollMessage(message)) {''',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "      if (isCopyPathMessage(message)) {",
    '''      if (isSetCharacterMessage(message)) {
        if (this.viewState.selectedIdentity !== message.identity) {
          await this.postCharacterError("Selected asset changed before the character was saved.");
          return;
        }
        try {
          const assets = await this.onSetCharacter(message.identity, message.character);
          if (!this.disposed) {
            this.update(assets);
          }
        } catch (error) {
          await this.postCharacterError(formatError(error));
        }
        return;
      }

      if (isCopyPathMessage(message)) {''',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "    this.panel.webview.html = getWebviewHtml(this.panel.webview, this.assets, this.assetProfile);",
    "    this.panel.webview.html = getWebviewHtml(this.panel.webview, this.assets, this.assetProfile, this.viewMode);",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "}\n\nfunction getWebviewHtml(\n",
    '''  private async postCharacterError(message: string): Promise<void> {
    if (!this.disposed) {
      await this.panel.webview.postMessage({ type: "characterError", message });
    }
  }
}

function getWebviewHtml(
''',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "  assetProfile: AssetProfile,\n): string {",
    "  assetProfile: AssetProfile,\n  viewMode: AssetViewMode,\n): string {",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    '    : `<div class="content"><div class="grid">${cards}</div><aside id="details" class="details" hidden></aside></div>`;',
    '    : `<div class="content"><div id="asset-grid" class="grid">${cards}</div><aside id="details" class="details" hidden></aside></div>`;',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "  const serializedProfile = serializeForScript({ label: assetProfile.label, assetTypes: assetProfile.assetTypes });\n",
    "  const serializedProfile = serializeForScript({ label: assetProfile.label, assetTypes: assetProfile.assetTypes });\n  const serializedCharacters = serializeForScript(listCharacterNames(assets));\n",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr)); gap: 14px; align-items: start; }",
    '''    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr)); gap: 14px; align-items: start; }
    .grid.character-mode { display: block; }
    .character-group { margin-bottom: 22px; }
    .character-group[hidden] { display: none; }
    .character-heading { display: flex; align-items: baseline; gap: 8px; margin: 0 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--vscode-widget-border); }
    .character-title { font-size: 1.02rem; font-weight: 600; }
    .character-count { color: var(--vscode-descriptionForeground); font-size: 0.82em; }
    .character-assets { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr)); gap: 14px; align-items: start; }''',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "    .asset-type { margin-top: 6px; font-size: 0.78em; font-weight: 600; color: var(--vscode-descriptionForeground); }",
    "    .asset-type { margin-top: 6px; font-size: 0.78em; font-weight: 600; color: var(--vscode-descriptionForeground); }\n    .character-name { margin-top: 3px; font-size: 0.76em; color: var(--vscode-descriptionForeground); }",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "    @media (max-width: 900px) { .content { grid-template-columns: minmax(0, 1fr) minmax(260px, 340px); gap: 14px; } .grid { grid-template-columns: repeat(auto-fill, minmax(min(170px, 100%), 1fr)); } }",
    "    @media (max-width: 900px) { .content { grid-template-columns: minmax(0, 1fr) minmax(260px, 340px); gap: 14px; } .grid, .character-assets { grid-template-columns: repeat(auto-fill, minmax(min(170px, 100%), 1fr)); } }",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "    @media (max-width: 440px) { body { padding: 12px; } .toolbar { flex-wrap: wrap; gap: 8px; } .search { order: 1; flex-basis: 100%; max-width: none; } .summary { margin-left: 0; } .facet-label { flex: 1 1 100%; } .facet-select { flex: 1; max-width: none; } .grid { grid-template-columns: 1fr; } }",
    "    @media (max-width: 440px) { body { padding: 12px; } .toolbar { flex-wrap: wrap; gap: 8px; } .search { order: 1; flex-basis: 100%; max-width: none; } .summary { margin-left: 0; } .facet-label { flex: 1 1 100%; } .facet-select { flex: 1; max-width: none; } .grid, .character-assets { grid-template-columns: 1fr; } }",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    '    ${renderFacetSelect("folder-filter", "Folder", facetOptions.folders)}',
    '    <label class="facet-label">View<select id="view-mode" class="facet-select" aria-label="Asset view mode"><option value="grid"${viewMode === "grid" ? " selected" : ""}>Grid</option><option value="character"${viewMode === "character" ? " selected" : ""}>Characters</option></select></label>\n    ${renderFacetSelect("folder-filter", "Folder", facetOptions.folders)}',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "    const assetProfile = ${serializedProfile};\n",
    "    const assetProfile = ${serializedProfile};\n    const characterNames = ${serializedCharacters};\n",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "    const details = document.getElementById('details');\n",
    "    const details = document.getElementById('details');\n    const assetGrid = document.getElementById('asset-grid');\n    const viewModeControl = document.getElementById('view-mode');\n",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));\n",
    '''    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    if (viewModeControl) viewModeControl.addEventListener('change', () => {
      applyViewMode(viewModeControl.value);
      vscode.postMessage({ type: 'viewMode', viewMode: viewModeControl.value });
    });
''',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "      if (message.type === 'copyPathResult') {",
    '''      if (message.type === 'characterError') {
        const input = document.getElementById('character-input');
        const save = document.getElementById('character-save');
        const clear = document.getElementById('character-clear');
        if (input) input.disabled = false;
        if (save) save.disabled = false;
        if (clear) clear.disabled = false;
        const status = document.getElementById('character-status');
        if (status) status.textContent = message.message || 'Unable to save character.';
        return;
      }

      if (message.type === 'copyPathResult') {''',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "      summary.textContent = count === total\n",
    "      updateCharacterGroups();\n      summary.textContent = count === total\n",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "    function setSelectedCard(selectedCard) {",
    '''    function applyViewMode(mode) {
      if (!assetGrid) return;
      const cards = Array.from(document.querySelectorAll('.card[data-asset-key]'));
      if (mode !== 'character') {
        cards.sort((left, right) => Number(left.dataset.assetOrder) - Number(right.dataset.assetOrder));
        assetGrid.replaceChildren(...cards);
        assetGrid.classList.remove('character-mode');
        if (viewModeControl) viewModeControl.value = 'grid';
        return;
      }

      const groups = new Map();
      cards.forEach((card) => {
        const character = card.dataset.character || '${UNASSIGNED_CHARACTER_LABEL}';
        const items = groups.get(character) || [];
        items.push(card);
        groups.set(character, items);
      });
      const labels = Array.from(groups.keys()).sort((left, right) => {
        if (left === '${UNASSIGNED_CHARACTER_LABEL}') return 1;
        if (right === '${UNASSIGNED_CHARACTER_LABEL}') return -1;
        return left.localeCompare(right);
      });
      const sections = labels.map((label) => {
        const section = document.createElement('section');
        section.className = 'character-group';
        const heading = document.createElement('div');
        heading.className = 'character-heading';
        const title = document.createElement('span');
        title.className = 'character-title';
        title.textContent = label;
        const count = document.createElement('span');
        count.className = 'character-count';
        heading.append(title, count);
        const assets = document.createElement('div');
        assets.className = 'character-assets';
        assets.append(...groups.get(label));
        section.append(heading, assets);
        return section;
      });
      assetGrid.replaceChildren(...sections);
      assetGrid.classList.add('character-mode');
      if (viewModeControl) viewModeControl.value = 'character';
      updateCharacterGroups();
    }

    function updateCharacterGroups() {
      document.querySelectorAll('.character-group').forEach((group) => {
        const visibleCount = Array.from(group.querySelectorAll('.card[data-asset-key]'))
          .filter((card) => !card.hidden).length;
        group.hidden = visibleCount === 0;
        const count = group.querySelector('.character-count');
        if (count) count.textContent = visibleCount + ' asset' + (visibleCount === 1 ? '' : 's');
      });
    }

    function setSelectedCard(selectedCard) {''',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "      addAssetTypeControl(result.workspaceAsset.assetType);\n",
    "      addAssetTypeControl(result.workspaceAsset.assetType);\n      addCharacterControl(result.workspaceAsset.character);\n",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "    function createVariantPanel() {",
    '''    function addCharacterControl(currentCharacter) {
      const row = document.createElement('div');
      row.className = 'detail-row';
      const label = document.createElement('label');
      label.className = 'detail-label';
      label.htmlFor = 'character-input';
      label.textContent = 'Character';

      const input = document.createElement('input');
      input.id = 'character-input';
      input.className = 'variant-control';
      input.type = 'text';
      input.maxLength = 64;
      input.placeholder = 'Unassigned';
      input.value = typeof currentCharacter === 'string' ? currentCharacter : '';
      input.setAttribute('list', 'character-options');

      const dataList = document.createElement('datalist');
      dataList.id = 'character-options';
      characterNames.forEach((character) => {
        const option = document.createElement('option');
        option.value = character;
        dataList.appendChild(option);
      });

      const actions = document.createElement('div');
      actions.className = 'details-actions';
      let save;
      let clear;
      const saveCharacter = (value) => {
        if (!selectedIdentity) return;
        input.disabled = true;
        if (save) save.disabled = true;
        if (clear) clear.disabled = true;
        const status = document.getElementById('character-status');
        if (status) status.textContent = 'Saving character…';
        const character = value.trim();
        vscode.postMessage({
          type: 'setCharacter',
          identity: selectedIdentity,
          character: character || undefined,
        });
      };
      save = actionButton('Save Character', false, () => saveCharacter(input.value));
      save.id = 'character-save';
      clear = actionButton('Clear', true, () => {
        input.value = '';
        saveCharacter('');
      });
      clear.id = 'character-clear';
      actions.append(save, clear);

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveCharacter(input.value);
        }
      });

      const status = statusNode('character-status');
      row.append(label, input, dataList, actions, status);
      details.appendChild(row);
    }

    function createVariantPanel() {''',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "    updateFilterStatus();\n    vscode.postMessage({ type: 'ready' });",
    "    applyViewMode(viewModeControl ? viewModeControl.value : 'grid');\n    updateFilterStatus();\n    vscode.postMessage({ type: 'ready' });",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "function renderAssetCard(webview: vscode.Webview, workspaceAsset: WorkspaceAsset): string {\n",
    "function renderAssetCard(webview: vscode.Webview, workspaceAsset: WorkspaceAsset, assetOrder?: number): string {\n",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "  const cards = assets.map((asset) => renderAssetCard(webview, asset)).join(\"\\n\");",
    "  const cards = assets.map((asset, index) => renderAssetCard(webview, asset, index)).join(\"\\n\");",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "  const assetType = workspaceAsset.assetType ?? UNCATEGORIZED_ASSET_TYPE_LABEL;\n  const accessibleLabel = `Show details for ${asset.fileName}, ${assetType}, ${displayPath}`;",
    "  const assetType = workspaceAsset.assetType ?? UNCATEGORIZED_ASSET_TYPE_LABEL;\n  const character = workspaceAsset.character ?? UNASSIGNED_CHARACTER_LABEL;\n  const accessibleLabel = `Show details for ${asset.fileName}, ${assetType}, character ${character}, ${displayPath}`;",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    '  return `<article class="card" tabindex="0" role="button" aria-label="${escapeHtml(accessibleLabel)}" data-asset-key="${escapeHtml(identity)}">',
    '  return `<article class="card" tabindex="0" role="button" aria-label="${escapeHtml(accessibleLabel)}" data-asset-key="${escapeHtml(identity)}" data-character="${escapeHtml(character)}" data-asset-order="${assetOrder ?? 0}">',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "      <div class=\"asset-type\">${escapeHtml(assetType)}</div>\n      <div class=\"path\"",
    "      <div class=\"asset-type\">${escapeHtml(assetType)}</div>\n      <div class=\"character-name\">Character: ${escapeHtml(character)}</div>\n      <div class=\"path\"",
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "function isScrollMessage(message: unknown): message is { type: \"scroll\"; scrollY: number } {\n",
    '''function isViewModeMessage(message: unknown): message is { type: "viewMode"; viewMode: AssetViewMode } {
  return typeof message === "object"
    && message !== null
    && "type" in message
    && message.type === "viewMode"
    && "viewMode" in message
    && (message.viewMode === "grid" || message.viewMode === "character");
}

function isScrollMessage(message: unknown): message is { type: "scroll"; scrollY: number } {
''',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "function isCopyPathMessage(message: unknown): message is { type: \"copyPath\"; identity: string } {\n",
    '''function isSetCharacterMessage(message: unknown): message is { type: "setCharacter"; identity: string; character?: string } {
  if (!isIdentityMessage(message, "setCharacter")) {
    return false;
  }
  if (!("character" in message) || message.character === undefined) {
    return true;
  }
  return typeof message.character === "string" && message.character.length <= 64;
}

function isCopyPathMessage(message: unknown): message is { type: "copyPath"; identity: string } {
''',
)

Path("test/assetCharacterGrouping.test.ts").write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import {
  groupWorkspaceAssetsByCharacter,
  listCharacterNames,
  UNASSIGNED_CHARACTER_LABEL,
} from "../src/core/assetCharacterGrouping";
import { type WorkspaceAsset } from "../src/workspaceAsset";

function asset(relativePath: string, character?: string, assetType?: string): WorkspaceAsset {
  return {
    workspaceFolderUri: "file:///game",
    workspaceFolderName: "game",
    asset: {
      absolutePath: `/game/${relativePath}`,
      relativePath,
      fileName: relativePath.split("/").at(-1) ?? relativePath,
      fileType: "png",
    },
    ...(character ? { character } : {}),
    ...(assetType ? { assetType } : {}),
  };
}

test("groups one character across asset types and folders", () => {
  const groups = groupWorkspaceAssetsByCharacter([
    asset("characters/alice/standing.png", "Alice", "Character"),
    asset("expressions/alice-angry.png", "Alice", "Expression"),
    asset("ui/alice-icon.png", "Alice", "Icon"),
    asset("characters/bob.png", "Bob", "Character"),
  ]);

  assert.deepEqual(groups.map((group) => [group.label, group.assets.length]), [
    ["Alice", 3],
    ["Bob", 1],
  ]);
  assert.deepEqual(groups[0].assets.map((item) => item.assetType), ["Character", "Expression", "Icon"]);
});

test("puts assets without a character in an explicit Unassigned group", () => {
  const groups = groupWorkspaceAssetsByCharacter([
    asset("characters/alice.png", "Alice"),
    asset("ui/unknown.png"),
  ]);
  assert.equal(groups.at(-1)?.label, UNASSIGNED_CHARACTER_LABEL);
  assert.deepEqual(groups.at(-1)?.assets.map((item) => item.asset.relativePath), ["ui/unknown.png"]);
});

test("lists existing character values uniquely and deterministically", () => {
  assert.deepEqual(listCharacterNames([
    asset("b.png", "Bob"),
    asset("a2.png", "Alice"),
    asset("a1.png", "Alice"),
    asset("none.png"),
  ]), ["Alice", "Bob"]);
});
''')

Path("test/assetCharacterMetadata.test.ts").write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import {
  AssetTypeMetadataError,
  createEmptyAssetTypeMetadata,
  getAssetCharacterAssignment,
  parseAssetTypeMetadata,
  serializeAssetTypeMetadata,
  setAssetCharacterAssignment,
  setAssetTypeAssignment,
} from "../src/core/assetTypeMetadata";
import { resolveAssetProfile } from "../src/core/assetProfiles";

test("parses and serializes character assignments beside asset types", () => {
  const metadata = parseAssetTypeMetadata(JSON.stringify({
    schemaVersion: 1,
    assignments: { "assets/alice.png": "Character" },
    characters: {
      "assets/alice.png": " Alice ",
      "assets/alice-angry.png": "Alice",
    },
  }));
  assert.equal(getAssetCharacterAssignment(metadata, "assets/alice.png"), "Alice");
  assert.match(serializeAssetTypeMetadata(metadata), /"characters"/);
  assert.match(serializeAssetTypeMetadata(metadata), /"assets\/alice-angry.png": "Alice"/);
});

test("type updates preserve character assignments", () => {
  const withCharacter = setAssetCharacterAssignment(createEmptyAssetTypeMetadata(), "assets/alice.png", "Alice");
  const withType = setAssetTypeAssignment(withCharacter, "assets/alice.png", "Character", resolveAssetProfile("rpg"));
  assert.equal(getAssetCharacterAssignment(withType, "assets/alice.png"), "Alice");
});

test("clears character independently and validates names", () => {
  const assigned = setAssetCharacterAssignment(createEmptyAssetTypeMetadata(), "assets/alice.png", "Alice");
  const cleared = setAssetCharacterAssignment(assigned, "assets/alice.png", undefined);
  assert.equal(getAssetCharacterAssignment(cleared, "assets/alice.png"), undefined);
  assert.doesNotMatch(serializeAssetTypeMetadata(cleared), /"characters"/);
  assert.throws(
    () => setAssetCharacterAssignment(createEmptyAssetTypeMetadata(), "assets/alice.png", "   "),
    AssetTypeMetadataError,
  );
  assert.throws(
    () => setAssetCharacterAssignment(createEmptyAssetTypeMetadata(), "../alice.png", "Alice"),
    AssetTypeMetadataError,
  );
});
''')

Path("test/assetCharacterWorkspace.test.ts").write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssetProfile } from "../src/core/assetProfiles";
import {
  loadWorkspaceAssetTypes,
  updateWorkspaceAssetCharacter,
  type WorkspaceAssetTypeStore,
} from "../src/assetTypeWorkspace";
import { type WorkspaceAsset } from "../src/workspaceAsset";

function asset(relativePath: string): WorkspaceAsset {
  return {
    workspaceFolderUri: "file:///game",
    workspaceFolderName: "game",
    asset: {
      absolutePath: `/game/${relativePath}`,
      relativePath,
      fileName: relativePath.split("/").at(-1) ?? relativePath,
      fileType: "png",
    },
  };
}

function memoryStore(initial?: string): WorkspaceAssetTypeStore & { value?: string } {
  let value = initial;
  return {
    get value() { return value; },
    read: async () => value,
    write: async (_workspaceFolderUri, text) => { value = text; },
  };
}

test("loads character and type metadata together", async () => {
  const store = memoryStore(JSON.stringify({
    schemaVersion: 1,
    assignments: { "assets/alice.png": "Character" },
    characters: { "assets/alice.png": "Alice" },
  }));
  const loaded = await loadWorkspaceAssetTypes([asset("assets/alice.png")], resolveAssetProfile("rpg"), store);
  assert.equal(loaded[0].assetType, "Character");
  assert.equal(loaded[0].character, "Alice");
});

test("writes and clears a character without a second metadata store", async () => {
  const store = memoryStore();
  const selected = asset("assets/alice.png");
  await updateWorkspaceAssetCharacter(selected, "Alice", store);
  assert.match(store.value ?? "", /"assets\/alice.png": "Alice"/);
  await updateWorkspaceAssetCharacter(selected, undefined, store);
  assert.doesNotMatch(store.value ?? "", /"characters"/);
});
''')

append_if_missing(
    "README.md",
    "## Character view",
    '''## Character view

Assets can optionally be assigned to a character in Asset Details. Switch the Asset Grid **View** control to **Characters** to group standing art, expressions, portraits, icons, battle sprites, and other cross-type images by character without changing the project folder structure.

Character assignments reuse `.game-asset-explorer/asset-types.json` as project-local Git-friendly metadata. Assets without an assignment appear under **Unassigned**. Search and existing facets still filter the grouped view.''',
)
