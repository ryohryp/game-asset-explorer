from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"pattern not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# Core: add optional generic review signals and mark one-off folders low-confidence/info.
replace_once(
    "src/core/folderOrganization.ts",
    'export type MetadataHygieneFindingKind = "uncategorized-assets";\n',
    'export type MetadataHygieneFindingKind = "uncategorized-assets";\n\nexport type FolderOrganizationFindingConfidence = "low" | "medium" | "high";\nexport type FolderOrganizationFindingSeverity = "info" | "warning";\n',
)
replace_once(
    "src/core/folderOrganization.ts",
    '  affectedAssets: FolderOrganizationAssetRef[];\n  suggestedTargetFolder?: string;\n}',
    '  affectedAssets: FolderOrganizationAssetRef[];\n  suggestedTargetFolder?: string;\n  confidence?: FolderOrganizationFindingConfidence;\n  severity?: FolderOrganizationFindingSeverity;\n}',
)
replace_once(
    "src/core/folderOrganization.ts",
    '      reason: `This leaf folder is ${depth} levels deep, contains one image asset, and has sibling folders. It may add navigation depth without much grouping value.`,\n      affectedFolders: [folder],',
    '      reason: `This leaf folder is ${depth} levels deep, contains one image asset, and has sibling folders. It may add navigation depth, but it may also represent an intentional domain boundary. Review project conventions and references before reorganizing it.`,\n      confidence: "low",\n      severity: "info",\n      affectedFolders: [folder],',
)

# Copy prompt: expose signals and tell reviewers how to interpret low-confidence findings.
replace_once(
    "src/core/organizationPrompt.ts",
    '      `   Reason: ${finding.reason}`,\n      `   Folders: ${finding.affectedFolders.map((folder) => folder || "Workspace root").join(", ")}`,',
    '      `   Reason: ${finding.reason}`,\n      ...(finding.severity ? [`   Severity: ${finding.severity}`] : []),\n      ...(finding.confidence ? [`   Confidence: ${finding.confidence}`] : []),\n      `   Folders: ${finding.affectedFolders.map((folder) => folder || "Workspace root").join(", ")}`,',
)
replace_once(
    "src/core/organizationPrompt.ts",
    '    "- Flag uncertain recommendations instead of guessing.",\n',
    '    "- Flag uncertain recommendations instead of guessing.",\n    "- Treat low-confidence findings as review candidates, not move recommendations.",\n',
)

# UI: show compact review signal on organization findings that carry one.
replace_once(
    "src/ui/assetGridPanel.ts",
    '    .organization-reason, .organization-target, .organization-folders { margin-top: 6px; font-size: 0.85em; overflow-wrap: anywhere; }\n    .organization-target { font-weight: 600; }',
    '    .organization-reason, .organization-target, .organization-folders { margin-top: 6px; font-size: 0.85em; overflow-wrap: anywhere; }\n    .organization-signal { display: inline-block; margin: 0 0 6px; padding: 2px 6px; border: 1px solid var(--vscode-widget-border); border-radius: 10px; color: var(--vscode-descriptionForeground); font-size: 0.76em; }\n    .organization-target { font-weight: 600; }',
)
replace_once(
    "src/ui/assetGridPanel.ts",
    "          const reason = document.createElement('div');\n          reason.className = 'organization-reason';\n          reason.textContent = finding.reason || '';\n          card.append(title, reason);",
    "          const reason = document.createElement('div');\n          reason.className = 'organization-reason';\n          reason.textContent = finding.reason || '';\n          card.appendChild(title);\n          if (!metadataSection && (finding.severity || finding.confidence)) {\n            const signal = document.createElement('div');\n            signal.className = 'organization-signal';\n            const parts = [];\n            if (finding.severity) parts.push(finding.severity === 'info' ? 'Info' : finding.severity);\n            if (finding.confidence) parts.push(finding.confidence.charAt(0).toUpperCase() + finding.confidence.slice(1) + ' confidence');\n            signal.textContent = parts.join(' · ');\n            card.appendChild(signal);\n          }\n          card.appendChild(reason);",
)

# Focused core test: one-off stays visible but is explicitly low-confidence informational.
replace_once(
    "test/folderOrganization.test.ts",
    'test("still flags a suspicious one-off leaf when the peer structure is not a namespace cluster", () => {\n  const report = analyzeFolderOrganization([\n    asset("assets/characters/alice/poses/combat/attack.png"),\n    asset("assets/characters/alice/poses/idle/idle.png"),\n  ]);\n  assert.ok(report.findings.some((item) => item.kind === "one-off-folder"));\n});',
    'test("marks a suspicious one-off leaf as a low-confidence informational review candidate", () => {\n  const report = analyzeFolderOrganization([\n    asset("assets/characters/alice/poses/combat/attack.png"),\n    asset("assets/characters/alice/poses/idle/idle.png"),\n  ]);\n  const finding = report.findings.find((item) => item.kind === "one-off-folder");\n  assert.ok(finding);\n  assert.equal(finding.confidence, "low");\n  assert.equal(finding.severity, "info");\n  assert.match(finding.reason, /intentional domain boundary/i);\n  assert.match(finding.reason, /review project conventions and references before reorganizing/i);\n});',
)

# Focused prompt test: carry the analyzer's uncertainty into the copied prompt.
p = Path("test/organizationPrompt.test.ts")
text = p.read_text()
anchor = '\n\ntest("does not permit concrete Asset Type recommendations when no active profile is supplied", () => {'
if anchor not in text:
    raise SystemExit("prompt test insertion anchor not found")
new_test = '''\n\ntest("presents one-off folders as low-confidence review candidates", () => {\n  const assets = [\n    asset("assets/scenes/events/cg.png"),\n    asset("assets/scenes/backgrounds/day.png"),\n    asset("assets/scenes/backgrounds/night.png"),\n  ];\n  const prompt = buildOrganizationPrompt(analyzeFolderOrganization(assets), assets);\n  assert.match(prompt, /Severity: info/);\n  assert.match(prompt, /Confidence: low/);\n  assert.match(prompt, /Treat low-confidence findings as review candidates, not move recommendations/);\n  assert.match(prompt, /intentional domain boundary/i);\n});\n'''
text = text.replace(anchor, new_test + anchor, 1)
p.write_text(text)
