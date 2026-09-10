import subprocess

source = subprocess.check_output(
    ["git", "show", "HEAD^:.github/issue54_apply.py"],
    text=True,
)
old = "  const groups = [...assigned.entries()]"
new = "  const groups: CharacterAssetGroup[] = [...assigned.entries()]"
if source.count(old) != 1:
    raise SystemExit(f"expected one character-group type anchor, found {source.count(old)}")
exec(compile(source.replace(old, new, 1), "issue54_apply_base.py", "exec"))
