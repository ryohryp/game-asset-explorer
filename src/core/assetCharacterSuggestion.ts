const CHARACTER_CONTAINER_SEGMENTS = new Set([
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
