import {
  isAssetProfileId,
  type AssetProfile,
  type AssetProfileId,
} from "../core/assetProfiles";

const SELECTABLE_PROFILES: ReadonlyArray<readonly [AssetProfileId, string]> = [
  ["generic", "Generic"],
  ["rpg", "RPG"],
  ["action", "Action"],
  ["visual-novel", "Visual Novel"],
  ["card-game", "Card Game"],
  ["custom", "Custom"],
];

export interface AssetProfileSelectorStrings {
  label: string;
  profileLabels: Readonly<Record<string, string>>;
}

export function injectAssetProfileSelector(
  html: string,
  activeProfile: AssetProfile,
  strings: AssetProfileSelectorStrings,
): string {
  const options = SELECTABLE_PROFILES.map(([id, label]) => {
    const localizedLabel = strings.profileLabels[label] ?? label;
    const selected = id === activeProfile.id ? " selected" : "";
    return `<option value="${id}"${selected}>${escapeHtml(localizedLabel)}</option>`;
  }).join("");

  const control = `<label class="facet-label profile-status">${escapeHtml(strings.label)}<select id="asset-profile-select" class="facet-select" aria-label="${escapeHtml(strings.label)}">${options}</select></label>`;
  const replaced = html.replace(/<span class="profile-status">[\s\S]*?<\/span>/, control);
  if (replaced === html) {
    return html;
  }

  const activeProfileId = JSON.stringify(activeProfile.id);
  const behavior = `
    const assetProfileSelect = document.getElementById('asset-profile-select');
    if (assetProfileSelect) {
      assetProfileSelect.addEventListener('change', () => {
        assetProfileSelect.disabled = true;
        vscode.postMessage({ type: 'setAssetProfile', profileId: assetProfileSelect.value });
      });
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'assetProfileUpdateFailed') {
          assetProfileSelect.disabled = false;
          assetProfileSelect.value = ${activeProfileId};
        }
      });
    }
`;

  return replaced.replace("</script>", `${behavior}  </script>`);
}

export function parseSetAssetProfileMessage(value: unknown): AssetProfileId | undefined {
  if (
    typeof value !== "object"
    || value === null
    || !("type" in value)
    || !("profileId" in value)
  ) {
    return undefined;
  }

  const message = value as { type?: unknown; profileId?: unknown };
  if (message.type !== "setAssetProfile" || typeof message.profileId !== "string") {
    return undefined;
  }

  return isAssetProfileId(message.profileId) ? message.profileId : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
