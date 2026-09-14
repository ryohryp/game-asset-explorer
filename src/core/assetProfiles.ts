export const UNCATEGORIZED_ASSET_TYPE = "__uncategorized__";
export const UNCATEGORIZED_ASSET_TYPE_LABEL = "Uncategorized";

export type AssetProfileId = "generic" | "rpg" | "action" | "visual-novel" | "card-game" | "custom";

export interface AssetProfileCustomization {
  addAssetTypes?: readonly string[];
  removeAssetTypes?: readonly string[];
  subtypes?: Readonly<Record<string, readonly string[]>>;
}

export interface AssetProfile {
  id: AssetProfileId;
  label: string;
  assetTypes: readonly string[];
  subtypes: Readonly<Record<string, readonly string[]>>;
}

const BUILT_IN_PROFILES: Record<Exclude<AssetProfileId, "custom">, AssetProfile> = {
  generic: {
    id: "generic",
    label: "Generic",
    assetTypes: ["Character", "Background", "UI", "Icon", "Effect", "Item", "Other"],
    subtypes: {},
  },
  rpg: {
    id: "rpg",
    label: "RPG",
    assetTypes: ["Character", "Enemy", "NPC", "Item", "Weapon", "Armor", "Skill", "Map", "UI", "Effect"],
    subtypes: {
      Character: ["portrait", "standing", "idle", "attack", "damage"],
      Enemy: ["idle", "attack", "damage"],
    },
  },
  action: {
    id: "action",
    label: "Action",
    assetTypes: ["Character", "Enemy", "Weapon", "Projectile", "Stage", "UI", "Effect"],
    subtypes: {
      Character: ["idle", "attack", "damage"],
      Enemy: ["idle", "attack", "damage"],
    },
  },
  "visual-novel": {
    id: "visual-novel",
    label: "Visual Novel",
    assetTypes: ["Character", "Expression", "Background", "CG", "UI", "Effect"],
    subtypes: {
      Character: ["standing", "expression", "portrait"],
    },
  },
  "card-game": {
    id: "card-game",
    label: "Card Game",
    assetTypes: ["Card", "Character", "Frame", "Icon", "Effect", "Background"],
    subtypes: {
      Card: ["front", "back"],
    },
  },
};

const MAX_CUSTOM_ASSET_TYPES = 32;
const MAX_ASSET_TYPE_LENGTH = 64;
const MAX_SUBTYPES_PER_ASSET_TYPE = 32;
const MAX_ASSET_SUBTYPE_LENGTH = 64;

export function resolveAssetProfile(
  configuredId: string | undefined,
  customAssetTypes: readonly string[] = [],
  customization: AssetProfileCustomization = {},
): AssetProfile {
  const id = isAssetProfileId(configuredId) ? configuredId : "generic";
  const baseProfile: AssetProfile = id === "custom"
    ? {
        id,
        label: "Custom",
        assetTypes: normalizeCustomAssetTypes(customAssetTypes),
        subtypes: {},
      }
    : BUILT_IN_PROFILES[id];

  return applyAssetProfileCustomization(baseProfile, customization);
}

export function applyAssetProfileCustomization(
  profile: AssetProfile,
  customization: AssetProfileCustomization = {},
): AssetProfile {
  const removed = new Set(normalizeCustomAssetTypes(customization.removeAssetTypes ?? []).map(normalizedKey));
  const assetTypes = profile.assetTypes.filter((assetType) => !removed.has(normalizedKey(assetType)));

  for (const assetType of normalizeCustomAssetTypes(customization.addAssetTypes ?? [])) {
    if (!assetTypes.some((existing) => normalizedKey(existing) === normalizedKey(assetType))) {
      assetTypes.push(assetType);
    }
  }

  const subtypes: Record<string, readonly string[]> = {};
  for (const assetType of assetTypes) {
    const inherited = profile.subtypes[assetType];
    if (inherited && inherited.length > 0) {
      subtypes[assetType] = [...inherited];
    }
  }

  for (const [configuredAssetType, configuredSubtypes] of Object.entries(customization.subtypes ?? {})) {
    const assetType = assetTypes.find((candidate) => normalizedKey(candidate) === normalizedKey(configuredAssetType));
    if (!assetType) {
      continue;
    }

    const normalizedSubtypes = normalizeAssetSubtypes(configuredSubtypes);
    if (normalizedSubtypes.length > 0) {
      subtypes[assetType] = normalizedSubtypes;
    } else {
      delete subtypes[assetType];
    }
  }

  return {
    ...profile,
    assetTypes,
    subtypes,
  };
}

export function normalizeCustomAssetTypes(values: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_ASSET_TYPE_LENGTH || trimmed === UNCATEGORIZED_ASSET_TYPE) {
      continue;
    }

    const key = normalizedKey(trimmed);
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

export function normalizeAssetSubtypes(values: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_ASSET_SUBTYPE_LENGTH || /[\u0000-\u001f\u007f]/.test(trimmed)) {
      continue;
    }

    const key = normalizedKey(trimmed);
    if (seen.has(key)) {
      continue;
    }

    normalized.push(trimmed);
    seen.add(key);
    if (normalized.length >= MAX_SUBTYPES_PER_ASSET_TYPE) {
      break;
    }
  }

  return normalized;
}

export function getAssetSubtypes(profile: AssetProfile, assetType: string): readonly string[] {
  return profile.subtypes[assetType] ?? [];
}

export function isAssetTypeAllowed(profile: AssetProfile, assetType: string): boolean {
  return profile.assetTypes.includes(assetType);
}

export function isAssetSubtypeAllowed(profile: AssetProfile, assetType: string, subtype: string): boolean {
  return getAssetSubtypes(profile, assetType).includes(subtype);
}

export function isAssetProfileId(value: string | undefined): value is AssetProfileId {
  return value === "generic"
    || value === "rpg"
    || value === "action"
    || value === "visual-novel"
    || value === "card-game"
    || value === "custom";
}

function normalizedKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}
