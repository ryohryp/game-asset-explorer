import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import type { WorkspaceAsset } from "../src/workspaceAsset";

// Exercise the extension adapter without a running VS Code host.
class Uri {
  constructor(readonly fsPath: string) {}
  toString(): string { return this.fsPath; }
  static joinPath(base: Uri, ...segments: string[]): Uri { return new Uri([base.fsPath, ...segments].join("/")); }
}
class FileSystemError extends Error { constructor(readonly code: string) { super(code); } }
class WorkspaceEdit {
  operations: unknown[][] = [];
  replace(...args: unknown[]): void { this.operations.push(["replace", ...args]); }
  renameFile(...args: unknown[]): void { this.operations.push(["rename", ...args]); }
}
const folder = { uri: new Uri("/game"), name: "game" };
const reference = new Uri("/game/main.ts");
const sourceText = 'const image = "assets/hero.png";';
let disk = sourceText;
let buffer = sourceText;
let dirty = false;
let collision = false;
let confirm: string | undefined;
let onConfirm: () => void;
let applied: WorkspaceEdit[];
let successful: boolean;
let messages: string[];
let previews: string[];
let searchedFolder: unknown;
const mock = {
  Uri, FileSystemError, WorkspaceEdit,
  FileType: { File: 1 },
  Range: class { constructor(readonly start: unknown, readonly end: unknown) {} },
  RelativePattern: class { constructor(readonly base: unknown, readonly pattern: string) { searchedFolder = base; } },
  workspace: {
    workspaceFolders: [folder, { uri: new Uri("/other"), name: "other" }],
    findFiles: async (_include: unknown, _exclude: unknown, limit: number) => { assert.equal(limit, 5000); return [reference]; },
    fs: {
      readDirectory: async () => [],
      stat: async (uri: Uri) => {
        if (uri.fsPath.endsWith("hero.png") || collision) return { type: 1 };
        throw new FileSystemError("FileNotFound");
      },
      readFile: async () => new TextEncoder().encode(disk),
    },
    openTextDocument: async (input: Uri | { content: string }) => {
      if (!(input instanceof Uri)) { previews.push(input.content); return { preview: true }; }
      return { getText: () => buffer, get isDirty() { return dirty; }, version: 1, isClosed: false, positionAt: (offset: number) => offset };
    },
    applyEdit: async (edit: WorkspaceEdit) => { applied.push(edit); return successful; },
  },
  window: {
    showTextDocument: async () => undefined,
    showWarningMessage: async (_message: string, options: { detail: string }) => {
      assert.match(options.detail, /Dynamic, ambiguous/);
      assert.equal(previews.length, 1);
      onConfirm();
      return confirm;
    },
    showInformationMessage: async (message: string) => { messages.push(message); },
  },
};
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
loader._load = function (id, ...args) { return id === "vscode" ? mock : originalLoad.call(this, id, ...args); };
const { renameAssetReferences } = require("../src/safeRenameCommand") as typeof import("../src/safeRenameCommand");
loader._load = originalLoad;
const asset: WorkspaceAsset = {
  workspaceFolderUri: "/game", workspaceFolderName: "game",
  asset: { absolutePath: "/game/assets/hero.png", relativePath: "assets/hero.png", fileName: "hero.png", fileType: "png" },
};

function reset(): void {
  disk = buffer = sourceText; dirty = collision = false;
  confirm = "Rename and Update References"; onConfirm = () => {};
  applied = []; successful = true; messages = []; previews = [];
}

test("confirmation applies references and non-overwriting rename in one WorkspaceEdit", async () => {
  reset();
  await renameAssetReferences(asset, "new.png");
  assert.equal(searchedFolder, folder);
  assert.match(previews[0], /assets\/hero.png -> assets\/new.png/);
  assert.match(previews[0], /main.ts:1:16/);
  assert.equal(applied.length, 1);
  assert.deepEqual(applied[0].operations.map((op) => op[0]), ["rename", "replace"]);
  assert.equal(applied[0].operations[1][3], "assets/new.png");
  assert.deepEqual(applied[0].operations[0][3], { overwrite: false, ignoreIfExists: false });
  assert.equal(messages.length, 1);
});

test("cancel after preview writes nothing", async () => {
  reset(); confirm = undefined;
  await renameAssetReferences(asset, "new.png");
  assert.equal(previews.length, 1);
  assert.deepEqual(applied, []);
});

test("destination collision blocks before preview and writes", async () => {
  reset(); collision = true;
  await assert.rejects(renameAssetReferences(asset, "new.png"), /Destination already exists/);
  assert.deepEqual(applied, []); assert.deepEqual(previews, []);
});

test("destination created during preview blocks the entire edit", async () => {
  reset(); onConfirm = () => { collision = true; };
  await assert.rejects(renameAssetReferences(asset, "new.png"), /Destination already exists/);
  assert.deepEqual(applied, []);
});

test("changed disk, dirty buffers and changed editor text invalidate approval", async () => {
  for (const mutate of [() => { disk += "changed"; }, () => { dirty = true; }, () => { buffer += "changed"; }]) {
    reset(); onConfirm = mutate;
    await assert.rejects(renameAssetReferences(asset, "new.png"), /changed or has unsaved edits/);
    assert.deepEqual(applied, []);
  }
});

test("failed mixed edit is reported without success or a separate filesystem retry", async () => {
  reset(); successful = false;
  await assert.rejects(renameAssetReferences(asset, "new.png"), /may not be fully atomic/);
  assert.equal(applied.length, 1); assert.deepEqual(messages, []);
});

test("zero deterministic references still requires a preview and confirmation", async () => {
  reset(); disk = buffer = 'const path = `assets/${name}.png`;';
  await renameAssetReferences(asset, "new.png");
  assert.match(previews[0], /Detected edits: 0/);
  assert.deepEqual(applied[0].operations.map((op) => op[0]), ["rename"]);
});
