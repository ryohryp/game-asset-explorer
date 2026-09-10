export const UNCATEGORIZED_ASSET_TYPE = "__uncategorized__";
export const UNCATEGORIZED_ASSET_TYPE_LABEL = "Uncategorized";

export type AssetProfileId = "generic" | "rpg" | "action" | "visual-novel" | "card-game" | "custom";

export interface AssetProfile {
  id: AssetProfileId;
  label: string;
  assetTypes: readonly string[];
}

const BUILT_IN_PROFILES: Record<Exclude<AssetProfileId, "custom">, AssetProfile> = {
  generic: {
    id: "generic",
    label: "Generic",
    assetTypes: ["Character", "Background", "UI", "Icon", "Effect", "Item", "Other"],
  },
  rpg: {
    id: "rpg",
    label: "RPG",
    assetTypes: ["Character", "Enemy", "NPC", "Item", "Weapon", "Armor", "Skill", "Map", "UI", "Effect"],
  },
  action: {
    id: "action",
    label: "Action",
    assetTypes: ["Character", "Enemy", "Weapon", "Projectile", "Stage", "UI", "Effect"],
  },
  "visual-novel": {
    id: "visual-novel",
    label: "Visual Novel",
    assetTypes: ["Character", "Expression", "Background", "CG", "UI", "Effect"],
  },
  "card-game": {
    id: "card-game",
    label: "Card Game",
    assetTypes: ["Card", "Character", "Frame", "Icon", "Effect", "Background"],
  },
};

const MAX_CUSTOM_ASSET_TYPES = 32;
const MAX_ASSET_TYPE_LENGTH = 64;

export function resolveAssetProfile(
  configuredId: string | undefined,
  customAssetTypes: readonly string[] = [],
): AssetProfile {
  const id = isAssetProfileId(configuredId) ? configuredId : "generic";
  if (id === "custom") {
    return {
      id,
      label: "Custom",
      assetTypes: normalizeCustomAssetTypes(customAssetTypes),
    };
  }

  return BUILT_IN_PROFILES[id];
}

export function normalizeCustomAssetTypes(values: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_ASSET_TYPE_LENGTH || trimmed === UNCATEGORIZED_ASSET_TYPE) {
      continue;
    }

    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }

    normalized.push(trimmed);
    seen.add(key);
    if (normalized.length >= MAX_CUSTOM_ASSET_TYPES) {
      break;
    }
  }

  return normalized;
}

export function isAssetTypeAllowed(profile: AssetProfile, assetType: string): boolean {
  return profile.assetTypes.includes(assetType);
}

export function isAssetProfileId(value: string | undefined): value is AssetProfileId {
  return value === "generic"
    || value === "rpg"
    || value === "action"
    || value === "visual-novel"
    || value === "card-game"
    || value === "custom";
}
