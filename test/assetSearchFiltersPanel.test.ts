import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { filterWorkspaceAssetsForSearch } from "../src/assetFacets";
import { resolveAssetProfile } from "../src/core/assetProfiles";
import { localizeAssetGridHtml } from "../src/ui/assetGridHtmlLocalization";
import { createAssetGridUiStrings } from "../src/ui/localization";
import type { AssetGridPanel, AssetGridPanelOptions } from "../src/ui/assetGridPanelBase";
import { getWorkspaceAssetIdentity, type WorkspaceAsset } from "../src/workspaceAsset";

const assets: WorkspaceAsset[] = ["small", "large"].map((name) => ({
  workspaceFolderUri: "file:///game", workspaceFolderName: "game",
  asset: { absolutePath: `/game/${name}.png`, relativePath: `${name}.png`, fileName: `${name}.png`, fileType: "png" },
}));

interface PostedMessage {
  type: string;
  count?: number;
  identities?: string[];
  error?: string;
  result?: { workspaceAsset?: WorkspaceAsset };
  facets?: { size?: string; state?: string };
}

function harness(onSearch?: AssetGridPanelOptions["onSearch"]) {
  let receive!: (message: unknown) => Promise<void>;
  let dispose!: () => void;
  const messages: PostedMessage[] = [];
  const webview = {
    html: "", cspSource: "test:",
    asWebviewUri: (uri: string) => uri,
    onDidReceiveMessage: (callback: typeof receive) => { receive = callback; },
    postMessage: async (message: PostedMessage) => { messages.push(message); return true; },
  };
  const vscode = {
    workspace: {}, ViewColumn: { One: 1 }, Uri: { file: (value: string) => value },
    window: { createWebviewPanel: () => ({ webview, onDidDispose: (callback: () => void) => { dispose = callback; } }) },
  };
  // Load the compiled panel with only its VS Code boundary replaced; execute real handlers.
  const filename = join(__dirname, "../src/ui/assetGridPanelBase.js");
  const localRequire = createRequire(filename);
  const exported: { AssetGridPanel?: typeof AssetGridPanel } = {};
  runInNewContext(readFileSync(filename, "utf8"), {
    exports: exported, require: (name: string) => name === "vscode" ? vscode : localRequire(name), console,
  });
  const panel = exported.AssetGridPanel!.show({
    assetProfile: resolveAssetProfile("generic"),
    onSearch: onSearch ?? ((query, facets, isCurrent) => filterWorkspaceAssetsForSearch(assets, query, facets, {
      sizeBytes: async (asset) => asset === assets[0] ? 1 : 5 * 1024 * 1024,
      problems: async (candidates) => candidates.filter((asset) => asset === assets[1]),
    }, isCurrent)),
    onSelect: async (identity) => ({ status: "available", workspaceAsset: assets.find((asset) => getWorkspaceAssetIdentity(asset) === identity)!, details: { sizeBytes: 1, modifiedAt: 0 } }),
    onRejectVariant: async () => {},
  } as AssetGridPanelOptions);
  panel.update(assets);
  return { panel, webview, messages, receive: (message: unknown) => receive(message), dispose: () => dispose() };
}

test("grid filters combine, refresh retains them, Details opens, and clear restores all", async () => {
  const h = harness();
  await h.receive({ type: "filter", query: "large", facets: { fileType: "png", size: "at-least-5-mib", state: "problems" } });
  assert.equal(h.messages.at(-1)?.count, 1);
  assert.equal(h.messages.at(-1)?.identities?.[0], getWorkspaceAssetIdentity(assets[1]));
  await h.receive({ type: "select", identity: getWorkspaceAssetIdentity(assets[1]) });
  assert.equal(h.messages.at(-1)?.type, "assetDetails");
  assert.equal(h.messages.at(-1)?.result?.workspaceAsset, assets[1]);
  h.panel.update(assets);
  await h.receive({ type: "ready" });
  const restored = [...h.messages].reverse().find((message) => message.type === "restoreState");
  assert.equal(restored?.facets?.size, "at-least-5-mib");
  assert.equal(restored?.facets?.state, "problems");
  assert.equal(restored?.count, 1);
  await h.receive({ type: "filter", query: "", facets: {} });
  assert.equal(h.messages.at(-1)?.count, 2);
});

test("rejects malformed filter messages before any loader runs", async () => {
  const h = harness(async () => { assert.fail("untrusted filters reached search"); });
  for (const facets of [{ size: -1 }, { size: "huge" }, { state: "clean" }, { state: {} }, { fileType: "exe" }]) {
    await h.receive({ type: "filter", query: "", facets });
  }
  assert.equal(h.messages.length, 0);
});

test("older search and restore responses cannot overwrite clear", async () => {
  for (const type of ["filter", "ready"]) {
    let finish!: (value: WorkspaceAsset[]) => void;
    let calls = 0;
    const h = harness(async () => ++calls === 1 ? new Promise((resolve) => { finish = resolve; }) : assets);
    const pending = h.receive({ type, query: "large", facets: { state: "problems" } });
    await h.receive({ type: "filter", query: "", facets: {} });
    finish([assets[1]]);
    await pending;
    assert.equal(h.messages.length, 1);
    assert.equal(h.messages[0].count, 2);
  }
});

test("refresh and disposal invalidate pending filter results", async () => {
  for (const action of ["refresh", "dispose"]) {
    let finish!: (value: WorkspaceAsset[]) => void;
    const h = harness(() => new Promise((resolve) => { finish = resolve; }));
    const pending = h.receive({ type: "filter", query: "", facets: { state: "problems" } });
    if (action === "refresh") h.panel.update([]);
    else h.dispose();
    finish(assets);
    await pending;
    assert.equal(h.messages.length, 0);
  }
});

test("failed inspection shows an error and clearing recovers", async () => {
  const h = harness(async (_query, facets) => {
    if (facets.state) throw new Error("Invalid workspace rules");
    return assets;
  });
  await h.receive({ type: "filter", query: "", facets: { state: "problems" } });
  assert.match(h.messages.at(-1)?.error ?? "", /Invalid workspace rules/);
  assert.equal(h.messages.at(-1)?.count, 0);
  await h.receive({ type: "filter", query: "", facets: {} });
  assert.equal(h.messages.at(-1)?.error, undefined);
  assert.equal(h.messages.at(-1)?.count, 2);
});

test("actual webview Clear resets text and every facet, including localized UI", () => {
  const h = harness();
  const html = localizeAssetGridHtml(h.webview.html, createAssetGridUiStrings((text) => text), "en");
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)![1];
  const controls = new Map<string, {
    value: string; disabled: boolean; textContent: string;
    addEventListener: (event: string, callback: () => void) => void;
    events: Map<string, () => void>;
    replaceChildren: () => void;
    classList: { remove: () => void };
  }>();
  for (const id of ["search", "summary", "details", "asset-grid", "view-mode", "folder-filter", "asset-type-filter", "format-filter", "size-filter", "state-filter", "workspace-filter", "clear-filters", "filter-status", "filter-error", "organization-report", "analyze-organization", "refresh"]) {
    const events = new Map<string, () => void>();
    controls.set(id, { value: "", disabled: false, textContent: "", events, addEventListener: (event, callback) => { events.set(event, callback); }, replaceChildren: () => {}, classList: { remove: () => {} } });
  }
  const posted: { type: string; query?: string; facets?: Record<string, unknown> }[] = [];
  runInNewContext(script, {
    acquireVsCodeApi: () => ({ postMessage: (message: typeof posted[number]) => posted.push(message) }),
    document: { getElementById: (id: string) => controls.get(id), querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
  });
  const search = controls.get("search")!;
  const clear = controls.get("clear-filters")!;
  assert.equal(clear.disabled, true);
  search.value = "hero";
  search.events.get("input")!();
  assert.equal(clear.disabled, false, "text-only searches can be cleared");
  for (const [id, value] of Object.entries({ "size-filter": "at-least-5-mib", "state-filter": "problems", "folder-filter": "assets", "asset-type-filter": "Character", "format-filter": "png", "workspace-filter": "file:///game" })) controls.get(id)!.value = value;
  controls.get("size-filter")!.events.get("change")!();
  assert.equal(controls.get("filter-status")!.textContent, "7 active filters");
  clear.events.get("click")!();
  assert.equal(posted.at(-1)?.type, "filter");
  assert.equal(posted.at(-1)?.query, "");
  assert.ok(Object.values(posted.at(-1)!.facets!).every((value) => value === undefined));
  assert.equal(clear.disabled, true);
});
