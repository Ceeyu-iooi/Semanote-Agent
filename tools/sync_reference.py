"""Build the developer reference page and copy explicit public artifacts to Vue dist."""

import html
from pathlib import Path
import shutil

projectRoot = Path(__file__).resolve().parent.parent


def syncReference():
    """Render text safely; never copy profile, private files, screenshots or receipts."""
    source = (projectRoot / "CHANGELOG.md").read_text(encoding="utf-8")
    body = []
    for line in source.splitlines():
        if line.startswith("## "): body.append("<h2>" + html.escape(line[3:]) + "</h2>")
        elif line.startswith("### "): body.append("<h3>" + html.escape(line[4:]) + "</h3>")
        elif line.startswith("- "): body.append("<p class=entry>" + html.escape(line[2:]) + "</p>")
        elif line and not line.startswith("# "): body.append("<p>" + html.escape(line) + "</p>")
    page = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Semanote · Changelog</title><link rel="stylesheet" href="design/tokens.css"><style>body{margin:0;padding:48px 32px;background:var(--color-canvas);color:var(--color-ink);font:400 17px/1.6 var(--font-body)}main{max-width:900px;margin:auto}h1{font-size:40px;font-weight:600}h2{font-size:28px;margin-top:48px;padding-top:24px;border-top:1px solid var(--color-border)}h3{font-size:21px}.eyebrow{color:var(--color-primary);font-size:12px;letter-spacing:1px}.entry{padding-left:17px;border-left:2px solid var(--color-border)}@media(max-width:640px){body{padding:24px 17px}h1{font-size:28px}}</style><main><p class="eyebrow">SEMANOTE / PROJECT HISTORY</p><h1>Changelog</h1>' + ''.join(body) + '</main></html>\n'
    (projectRoot / "docs/changelog.html").write_text(page, encoding="utf-8")
    destination = projectRoot / "frontend/dist/reference"
    destination.mkdir(parents=True, exist_ok=True)
    designRoot = projectRoot / "docs/design"
    for relative in ("preview.html", "tokens.css", "README.md", "apple/DESIGN.md", "apple/LICENSE", "apple/source.json"):
        target = destination / "design" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(designRoot / relative, target)
    for name in ("system-architecture", "agent-architecture", "frontend-architecture", "backend-architecture", "database-architecture", "git-workflow"):
        sourcePath = projectRoot / ("docs/diagrams/" + name + ".html")
        if sourcePath.exists():
            target = destination / "diagrams" / sourcePath.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(sourcePath, target)
    shutil.copyfile(projectRoot / "docs/changelog.html", destination / "changelog.html")
    licenseTarget = projectRoot / "frontend/dist/licenses"
    licenseTarget.mkdir(exist_ok=True)
    for sourcePath in (projectRoot / "docs/licenses").iterdir():
        if sourcePath.is_file(): shutil.copyfile(sourcePath, licenseTarget / sourcePath.name)
    shutil.copyfile(projectRoot / "README.md", projectRoot / "frontend/dist/README.md")
    print("Developer references synchronized from explicit public sources.")


if __name__ == "__main__":
    syncReference()
