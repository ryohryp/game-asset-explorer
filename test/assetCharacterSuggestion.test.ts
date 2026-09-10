import * as assert from "node:assert/strict";
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
