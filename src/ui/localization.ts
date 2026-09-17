export type UiTranslator = (message: string) => string;

export const ASSET_GRID_LOCALIZATION_MESSAGES = {
  searchPlaceholder: "Search filename or path",
  searchAssets: "Search assets",
  analyzeOrganization: "Analyze Organization",
  analyzing: "Analyzing…",
  refresh: "Refresh",
  rerunAnalyzeOrganization: "Re-run Analyze Organization",
  view: "View",
  grid: "Grid",
  characters: "Characters",
  potentiallyUnused: "Potentially Unused",
  potentiallyUnusedCaveat: "Potentially Unused · candidate only; dynamic references may not be detected.",
  folder: "Folder",
  assetType: "Asset Type",
  format: "Format",
  workspace: "Workspace",
  clearFilters: "Clear filters",
  noFacetFilters: "No facet filters",
  activeFilter: "active filter",
  activeFilters: "active filters",
  profile: "Profile",
  all: "All",
  filterBy: "Filter by",
  noImageAssetsFound: "No image assets found.",
  configureDirectoriesAndRefresh: "Configure gameAssetExplorer.assetDirectories and refresh.",
  imageAsset: "image asset",
  imageAssets: "image assets",
  asset: "asset",
  assets: "assets",
  previewUnavailable: "Preview unavailable",
  showDetailsFor: "Show details for",
  character: "Character",
  unassigned: "Unassigned",
  uncategorized: "Uncategorized",
  assetUnavailable: "Asset unavailable",
  assetUnavailableMessage: "This asset no longer exists or is no longer in the current asset list. Refresh to rebuild from the filesystem.",
  path: "Path",
  size: "Size",
  modified: "Modified",
  copyAssetPath: "Copy Asset Path",
  findUsages: "Find Usages",
  checkAssetHealth: "Check Asset Health",
  generateVariant: "Generate Variant",
  searchingWorkspace: "Searching workspace…",
  checkingDirectReferences: "Checking direct workspace references…",
  savingType: "Saving type…",
  savingCharacter: "Saving character…",
  saveCharacter: "Save Character",
  clear: "Clear",
  suggestedCharacter: "Suggested character",
  useSuggestion: "Use Suggestion",
  pathCopied: "Path copied.",
  assetNoLongerAvailable: "Asset is no longer available.",
  unableSaveAssetType: "Unable to save asset type.",
  unableSaveCharacter: "Unable to save character.",
  folderOrganization: "Folder Organization",
  copyOrganizationPrompt: "Copy Organization Prompt",
  close: "Close",
  organizationPromptCopied: "Organization prompt copied.",
  unableCopyOrganizationPrompt: "Unable to copy organization prompt.",
  unableAssignAssetType: "Unable to assign Asset Type.",
  usages: "Usages",
  noTextUsages: "No text usages found in this workspace.",
  usageFound: "usage found.",
  usagesFound: "usages found.",
  line: "Line",
  column: "column",
  missingReferences: "Missing References",
  noMissingReferences: "No direct missing image references found in this workspace scan.",
  referenced: "Referenced",
  unusedCandidate: "Unused Candidate",
  missingReference: "Missing Reference",
  visualCanon: "Visual Canon",
  lineage: "Lineage",
  sources: "Sources",
  knownVariants: "Known Variants",
  none: "None",
  noMembership: "No membership",
  noRecordedRelationships: "No recorded relationships",
  missing: "Missing",
} as const;

const ASSET_TYPE_LABELS = [
  "Character",
  "Background",
  "UI",
  "Icon",
  "Effect",
  "Item",
  "Other",
  "Enemy",
  "NPC",
  "Weapon",
  "Armor",
  "Skill",
  "Map",
  "Projectile",
  "Stage",
  "Expression",
  "CG",
  "Card",
  "Frame",
] as const;

const PROFILE_LABELS = ["Generic", "RPG", "Action", "Visual Novel", "Card Game", "Custom"] as const;

type MessageKey = keyof typeof ASSET_GRID_LOCALIZATION_MESSAGES;

export type AssetGridUiStrings = Record<MessageKey, string> & {
  assetTypeLabels: Readonly<Record<string, string>>;
  profileLabels: Readonly<Record<string, string>>;
};

export function createAssetGridUiStrings(translate: UiTranslator): AssetGridUiStrings {
  const strings = Object.fromEntries(
    Object.entries(ASSET_GRID_LOCALIZATION_MESSAGES).map(([key, message]) => [key, translate(message)]),
  ) as Record<MessageKey, string>;

  return {
    ...strings,
    assetTypeLabels: Object.fromEntries(ASSET_TYPE_LABELS.map((label) => [label, translate(label)])),
    profileLabels: Object.fromEntries(PROFILE_LABELS.map((label) => [label, translate(label)])),
  };
}

export function localizeAssetTypeLabel(assetType: string, strings: AssetGridUiStrings): string {
  return assetType === "Uncategorized"
    ? strings.uncategorized
    : strings.assetTypeLabels[assetType] ?? assetType;
}

export function localizeCharacterLabel(character: string, strings: AssetGridUiStrings): string {
  return character === "Unassigned" ? strings.unassigned : character;
}

export function localizeProfileLabel(profile: string, strings: AssetGridUiStrings): string {
  return strings.profileLabels[profile] ?? profile;
}
