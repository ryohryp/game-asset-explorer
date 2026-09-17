import type { AssetProblemLimits } from "./assetProblems";
import { DEFAULT_ASSET_PROBLEM_LIMITS } from "./assetProblems";

export const ASSET_RULES_PATH = ".assetdevtools.json";

export interface AssetRule {
  path: string;
  maxWidth?: number;
  maxHeight?: number;
  maxSizeBytes?: number;
}

export interface AssetRulesConfig {
  rules: AssetRule[];
}

export function parseAssetRules(text: string): AssetRulesConfig {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || !Array.isArray((value as { rules?: unknown }).rules)) {
    throw new Error("Asset rules must contain a rules array.");
  }
  return { rules: (value as { rules: unknown[] }).rules.map(parseRule) };
}

export function resolveAssetProblemLimits(
  relativePath: string,
  config: AssetRulesConfig | undefined,
): AssetProblemLimits {
  const matching = config?.rules.filter((rule) => matchesPath(rule.path, relativePath)) ?? [];
  return matching.reduce((limits, rule) => ({
    maxWidth: rule.maxWidth ?? limits.maxWidth,
    maxHeight: rule.maxHeight ?? limits.maxHeight,
    maxSizeBytes: rule.maxSizeBytes ?? limits.maxSizeBytes,
  }), { ...DEFAULT_ASSET_PROBLEM_LIMITS });
}

function parseRule(value: unknown): AssetRule {
  if (!value || typeof value !== "object") throw new Error("Each asset rule must be an object.");
  const input = value as Record<string, unknown>;
  if (typeof input.path !== "string" || input.path.trim().length === 0) {
    throw new Error("Each asset rule requires a non-empty path.");
  }
  const rule: AssetRule = { path: normalizePath(input.path) };
  for (const key of ["maxWidth", "maxHeight", "maxSizeBytes"] as const) {
    const candidate = input[key];
    if (candidate !== undefined) {
      if (!Number.isSafeInteger(candidate) || (candidate as number) <= 0) {
        throw new Error(`${key} must be a positive integer.`);
      }
      rule[key] = candidate as number;
    }
  }
  return rule;
}

function matchesPath(pattern: string, relativePath: string): boolean {
  const escaped = normalizePath(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`).test(normalizePath(relativePath));
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}
