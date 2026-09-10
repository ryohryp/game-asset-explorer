from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

Path("src/core/assetCharacterSuggestion.ts").write_text(r'''const CHARACTER_CONTAINER_SEGMENTS = new Set([
  "character",
  "characters",
  "char",
  "chars",
  "expression",
  "expressions",
  "portrait",
  "portraits",
]);

const FILE_DESCRIPTOR_TOKENS = new Set([
  "angry",
  "attack",
  "battle",
  "happy",
  "icon",
  "idle",
  "neutral",
  "portrait",
  "sad",
  "smile",
  "standing",
]);

export function suggestCharacterAssignment(
  relativePath: string,
  knownCharacters: readonly string[],
  currentCharacter?: string,
): string | undefined {
  if (currentCharacter?.trim()) {
    return undefined;
  }

  const known = matchKnownCharacter(relativePath, knownCharacters);
  if (known) {
    return known;
  }

  return suggestFromPathConvention(relativePath);
}

function matchKnownCharacter(relativePath: string, knownCharacters: readonly string[]): string | undefined {
  const pathTokens = tokenize(stripExtension(relativePath));
  if (pathTokens.length === 0) {
    return undefined;
  }

  const matches = knownCharacters
    .map((character) => ({ character, tokens: tokenize(character) }))
    .filter(({ tokens }) => tokens.length > 0 && containsTokenSequence(pathTokens, tokens))
    .sort((left, right) => {
      const tokenLength = right.tokens.length - left.tokens.length;
      if (tokenLength !== 0) return tokenLength;
      const charLength = right.character.length - left.character.length;
      if (charLength !== 0) return charLength;
      return left.character.localeCompare(right.character);
    });

  return matches[0]?.character;
}

function suggestFromPathConvention(relativePath: string): string | undefined {
  const normalizedPath = relativePath.replace(/\\/g, "/");
  const rawSegments = normalizedPath.split("/").filter(Boolean);
  if (rawSegments.length === 0) return undefined;

  for (let index = 0; index < rawSegments.length - 1; index += 1) {
    if (!CHARACTER_CONTAINER_SEGMENTS.has(normalizeToken(rawSegments[index]))) continue;

    const next = rawSegments[index + 1];
    const isFile = index + 1 === rawSegments.length - 1;
    if (!isFile) {
      return cleanCandidate(next);
    }

    const baseName = stripExtension(next);
    const tokens = tokenize(baseName);
    if (tokens.length >= 2 && FILE_DESCRIPTOR_TOKENS.has(tokens[tokens.length - 1])) {
      return cleanCandidate(tokens.slice(0, -1).join(" "));
    }
  }

  return undefined;
}

function containsTokenSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length > haystack.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((token, offset) => haystack[start + offset] === token)) return true;
  }
  return false;
}

function tokenize(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function normalizeToken(value: string): string {
  return tokenize(value)[0] ?? "";
}

function stripExtension(value: string): string {
  return value.replace(/\.[^.\/\\]+$/, "");
}

function cleanCandidate(value: string): string | undefined {
  const candidate = value
    .normalize("NFKC")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!candidate || candidate.length > 64) return undefined;
  if (/^[0-9]+$/.test(candidate)) return undefined;
  return candidate;
}
''', encoding="utf-8")

Path("test/assetCharacterSuggestion.test.ts").write_text(r'''import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestCharacterAssignment } from "../src/core/assetCharacterSuggestion";

describe("asset character suggestions", () => {
  it("prefers existing character names matched on token boundaries", () => {
    assert.equal(
      suggestCharacterAssignment("ui/portrait_goblin-king_battle.png", ["Alice", "Goblin King"]),
      "Goblin King",
    );
    assert.equal(suggestCharacterAssignment("ui/alice_icon.png", ["Alice"]), "Alice");
  });

  it("does not substring-match known character names", () => {
    assert.equal(suggestCharacterAssignment("characters/malice/icon.png", ["Alice"]), "malice");
    assert.equal(suggestCharacterAssignment("ui/malice_icon.png", ["Alice"]), undefined);
  });

  it("derives a bounded candidate from character-oriented folders", () => {
    assert.equal(suggestCharacterAssignment("characters/alice/standing.png", []), "alice");
    assert.equal(suggestCharacterAssignment("expressions/goblin-king/angry.png", []), "goblin king");
    assert.equal(suggestCharacterAssignment("expressions/alice_angry.png", []), "alice");
  });

  it("returns no heuristic suggestion for unrelated folders", () => {
    assert.equal(suggestCharacterAssignment("backgrounds/forest/night.png", []), undefined);
    assert.equal(suggestCharacterAssignment("ui/icon_alice.png", []), undefined);
  });

  it("never suggests over an explicit assignment", () => {
    assert.equal(suggestCharacterAssignment("characters/alice/standing.png", ["Alice"], "Bob"), undefined);
  });
});
''', encoding="utf-8")

replace_once(
    "src/ui/assetGridPanel.ts",
    'import { listCharacterNames, UNASSIGNED_CHARACTER_LABEL } from "../core/assetCharacterGrouping";\n',
    'import { listCharacterNames, UNASSIGNED_CHARACTER_LABEL } from "../core/assetCharacterGrouping";\nimport { suggestCharacterAssignment } from "../core/assetCharacterSuggestion";\n',
)

replace_once(
    "src/ui/assetGridPanel.ts",
    '  const serializedCharacters = serializeForScript(listCharacterNames(assets));\n',
    '''  const characterNames = listCharacterNames(assets);\n  const serializedCharacters = serializeForScript(characterNames);\n  const serializedCharacterSuggestions = serializeForScript(Object.fromEntries(\n    assets\n      .map((asset) => [\n        getWorkspaceAssetIdentity(asset),\n        suggestCharacterAssignment(asset.asset.relativePath, characterNames, asset.character),\n      ] as const)\n      .filter((entry): entry is readonly [string, string] => typeof entry[1] === "string"),\n  ));\n''',
)

replace_once(
    "src/ui/assetGridPanel.ts",
    '    const characterNames = ${serializedCharacters};\n',
    '    const characterNames = ${serializedCharacters};\n    const characterSuggestions = ${serializedCharacterSuggestions};\n',
)

replace_once(
    "src/ui/assetGridPanel.ts",
    '      addCharacterControl(result.workspaceAsset.character);\n',
    '      addCharacterControl(result.workspaceAsset.character, selectedIdentity ? characterSuggestions[selectedIdentity] : undefined);\n',
)

replace_once(
    "src/ui/assetGridPanel.ts",
    '    function addCharacterControl(currentCharacter) {\n',
    '    function addCharacterControl(currentCharacter, suggestedCharacter) {\n',
)

replace_once(
    "src/ui/assetGridPanel.ts",
    '''      actions.append(save, clear);\n\n      input.addEventListener('keydown', (event) => {\n''',
    '''      actions.append(save, clear);\n\n      const suggestion = document.createElement('div');\n      if (typeof suggestedCharacter === 'string' && suggestedCharacter) {\n        suggestion.className = 'status';\n        suggestion.textContent = 'Suggested character: ' + suggestedCharacter;\n        const accept = actionButton('Use Suggestion', true, () => {\n          input.value = suggestedCharacter;\n          saveCharacter(suggestedCharacter);\n        });\n        actions.prepend(accept);\n      }\n\n      input.addEventListener('keydown', (event) => {\n''',
)

replace_once(
    "src/ui/assetGridPanel.ts",
    '      row.append(label, input, dataList, actions, status);\n',
    '      row.append(label, input, dataList, suggestion, actions, status);\n',
)

readme = Path("README.md")
text = readme.read_text(encoding="utf-8")
anchor = "## Character view\n"
if anchor in text and "Character suggestions" not in text:
    idx = text.index(anchor)
    # Insert a compact section before Character view to avoid relying on its exact body.
    text = text[:idx] + '''## Character suggestions\n\nFor unassigned assets, Asset Details can suggest a character from existing character names found in the path or from conservative character-oriented folder/file conventions. Suggestions are derived only: they are not written to project metadata until you choose **Use Suggestion**. Explicit character assignments always win.\n\n''' + text[idx:]
    readme.write_text(text, encoding="utf-8")
