import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import test from "node:test";

const packageJson = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8"),
) as {
  contributes?: {
    commands?: Array<{ command?: string }>;
    viewsContainers?: {
      activitybar?: Array<{ id?: string; title?: string; icon?: string }>;
    };
    views?: Record<string, Array<{ id?: string; name?: string }>>;
    viewsWelcome?: Array<{ view?: string; contents?: string; when?: string }>;
    menus?: {
      "view/title"?: Array<{ command?: string; when?: string }>;
    };
    configuration?: {
      properties?: Record<string, {
        default?: unknown;
        scope?: string;
        enum?: string[];
        maxItems?: number;
      }>;
    };
  };
};

test("contributes a visible Game Asset Explorer Activity Bar view", () => {
  const contributes = packageJson.contributes;
  assert.ok(contributes);

  const container = contributes.viewsContainers?.activitybar?.find((item) => item.id === "gameAssetExplorer");
  assert.ok(container);
  assert.equal(container.title, "Game Asset Explorer");
  assert.equal(container.icon, "media/asset-explorer.svg");

  const view = contributes.views?.gameAssetExplorer?.find((item) => item.id === "gameAssetExplorer.explorer");
  assert.ok(view);
  assert.equal(view.name, "Assets");
});

test("keeps existing commands and adds guided asset-directory configuration", () => {
  const commandIds = new Set(packageJson.contributes?.commands?.map((command) => command.command));

  assert.ok(commandIds.has("gameAssetExplorer.scanAssets"));
  assert.ok(commandIds.has("gameAssetExplorer.openAssetGrid"));
  assert.ok(commandIds.has("gameAssetExplorer.setOpenAiApiKey"));
  assert.ok(commandIds.has("gameAssetExplorer.configureAssetDirectories"));
});

test("provides actionable first-run and configured welcome states", () => {
  const welcomes = packageJson.contributes?.viewsWelcome ?? [];
  const unconfigured = welcomes.find((welcome) => (
    welcome.view === "gameAssetExplorer.explorer"
    && welcome.when?.includes("!gameAssetExplorer.hasUsableAssetDirectories")
  ));
  assert.ok(unconfigured?.contents?.includes("[Configure Asset Directories]"));

  const configured = welcomes.find((welcome) => (
    welcome.view === "gameAssetExplorer.explorer"
    && welcome.when === "gameAssetExplorer.hasUsableAssetDirectories"
  ));
  assert.ok(configured?.contents?.includes("[Open Asset Grid]"));

  const titleCommands = packageJson.contributes?.menus?.["view/title"] ?? [];
  assert.ok(titleCommands.some((entry) => entry.command === "gameAssetExplorer.openAssetGrid"));
  assert.ok(titleCommands.some((entry) => entry.command === "gameAssetExplorer.configureAssetDirectories"));
});

test("contributes workspace Asset Profile and bounded Custom type settings", () => {
  const properties = packageJson.contributes?.configuration?.properties ?? {};
  const profile = properties["gameAssetExplorer.assetProfile"];
  assert.ok(profile);
  assert.equal(profile.default, "generic");
  assert.equal(profile.scope, "window");
  assert.deepEqual(profile.enum, ["generic", "rpg", "action", "visual-novel", "card-game", "custom"]);

  const customTypes = properties["gameAssetExplorer.customAssetTypes"];
  assert.ok(customTypes);
  assert.equal(customTypes.scope, "window");
  assert.equal(customTypes.maxItems, 32);
});
