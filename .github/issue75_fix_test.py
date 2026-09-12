from pathlib import Path

p = Path("test/organizationPrompt.test.ts")
text = p.read_text()
old = '  assert.match(prompt, /Items that should remain unchanged/);\n'
new = '  assert.match(prompt, /No-change recommendations/);\n'
if old not in text:
    raise SystemExit("organization prompt expectation anchor not found")
p.write_text(text.replace(old, new, 1))
