"""Read-only verification of documentation, local originals and Git publication scope."""

import argparse
import collections
import csv
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

projectRoot = Path(__file__).resolve().parent.parent


def runGit(*args):
    """Read Git state without changing files, index or refs."""
    return subprocess.run(["git", "-C", str(projectRoot), *args], capture_output=True, text=True, encoding="utf-8", check=True).stdout.strip()


def verifyOriginals(auditData):
    """Verify original identities; optionally recompute all corpus statistics."""
    manifestPath = projectRoot / "profile/manifest.json"
    if not manifestPath.exists():
        if auditData:
            raise ValueError("Restricted originals are absent; full data audit cannot pass")
        print("SKIP original hashes: profile is not present in this public checkout.")
        return
    manifest = json.loads(manifestPath.read_text(encoding="utf-8-sig"))
    if len(manifest["files"]) != 5:
        raise ValueError("Expected exactly five original files")
    profileRoot = (projectRoot / "profile").resolve()
    for entry in manifest["files"]:
        path = (projectRoot / entry["localPath"]).resolve()
        if not path.is_relative_to(profileRoot):
            raise ValueError("Original path outside profile")
        with path.open("rb") as source:
            actualHash = hashlib.file_digest(source, "sha256").hexdigest()
        if actualHash != entry["sha256"] or path.stat().st_size != entry["sizeBytes"]:
            raise ValueError("Original identity changed: " + entry["localPath"])
    print("PASS original files: five sizes and SHA-256 identities match pre-move manifest.")
    if not auditData:
        return
    csvPath = profileRoot / "data/train.csv"
    with csvPath.open("rb") as source:
        if source.read(3) != b"\xef\xbb\xbf":
            raise ValueError("Expected UTF-8 BOM")
    texts = collections.Counter()
    rows = set()
    dataRows, repeatedRows, emptyCells = 0, 0, 0
    with csvPath.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.reader(source)
        if next(reader) != ["案件A", "案件B", "案件C"]:
            raise ValueError("Unexpected CSV columns")
        for row in reader:
            dataRows += 1
            if len(row) != 3:
                raise ValueError("Unexpected CSV row width")
            rowKey = tuple(row)
            if rowKey in rows:
                repeatedRows += 1
            rows.add(rowKey)
            emptyCells += sum(not text.strip() for text in row)
            texts.update(row)
    actualStats = (dataRows, sum(texts.values()), len(texts), repeatedRows, emptyCells)
    if actualStats != (5102, 15306, 1607, 6, 0):
        raise ValueError("Corpus audit differs from baseline: " + repr(actualStats))
    print("PASS data audit: 5102 rows, 15306 cells, 1607 unique texts, 6 repeated rows, 0 empty cells.")


def verifyDocumentation():
    """Check generated views and local Markdown links, including prompt anchors."""
    result = subprocess.run([sys.executable, "-B", str(projectRoot / "tools/sync_workflow.py"), "--check"], capture_output=True, text=True, encoding="utf-8")
    if result.returncode:
        raise ValueError(result.stdout + result.stderr)
    workflow = json.loads((projectRoot / "docs/workflow.json").read_text(encoding="utf-8"))
    print(f"PASS generated views: shared source, {len(workflow['stages'])} prompts and acyclic prerequisites.")
    for path in [projectRoot / "README.md", *sorted((projectRoot / "docs").glob("*.md"))]:
        content = path.read_text(encoding="utf-8")
        for match in re.finditer(r"(?<!!)\[[^\]]+\]\(([^)]+)\)", content):
            target = match.group(1)
            if "://" in target or target.startswith("mailto:"):
                continue
            relativePath, _, anchor = target.partition("#")
            destination = (path.parent / relativePath).resolve() if relativePath else path
            if not destination.exists():
                raise ValueError(f"Broken link in {path.name}: {target}")
            if anchor and f'id="{anchor}"' not in destination.read_text(encoding="utf-8"):
                raise ValueError(f"Missing explicit prompt anchor: {target}")
    html = (projectRoot / "docs/workflow.html").read_text(encoding="utf-8")
    if re.search(r"<(?:script|link|img)\b[^>]*(?:src|href)\s*=", html, re.I):
        raise ValueError("Offline view must not require external assets")
    for forbidden in ("fetch(", "XMLHttpRequest", "new WebSocket", "eval("):
        if forbidden in html:
            raise ValueError("Unexpected offline network or evaluation behavior")
    print("PASS documentation links and offline asset independence.")


def verifyGit(expectGit):
    """Check the baseline and explicitly reviewed agent/Web publication paths."""
    if not (projectRoot / ".git").exists():
        if expectGit:
            raise ValueError("Git repository is missing")
        print("SKIP Git refs: repository not yet initialized.")
        return
    rootFiles = {"README.md", "AGENTS.md", "CHANGELOG.md", "VERSION", ".gitignore", ".gitattributes", ".editorconfig", ".env.example"}
    readmeImages = {"assets/readme/workspace.png", "assets/readme/insights.png"}
    tracked = runGit("ls-files").splitlines()
    for fileName in tracked:
        if fileName not in rootFiles | readmeImages and not fileName.startswith(("docs/", "tools/", ".github/", "agent/", "semanote_agent/", "tests/", "examples/", "frontend/", "backend/")):
            raise ValueError("Outside publication allowlist: " + fileName)
        extension = Path(fileName).suffix.lower()
        allowedFormat = extension in {"", ".md", ".json", ".html", ".css", ".py", ".js", ".mjs", ".vue", ".java", ".xml", ".properties"} or fileName in readmeImages
        allowedFormat = allowedFormat or fileName in {"backend/src/main/resources/schema.sql", "tools/configure_lan.ps1"} or (fileName.startswith("docs/licenses/") and extension == ".txt")
        if not allowedFormat and fileName not in rootFiles:
            raise ValueError("Unexpected public file format: " + fileName)
        if any(part in {"__pycache__", "node_modules", "profile", "tmp", "target", "dist"} for part in Path(fileName).parts):
            raise ValueError("Unexpected tracked environment/original: " + fileName)
    ignored = subprocess.run(["git", "-C", str(projectRoot), "check-ignore", "profile/manifest.json", "profile/data/train.csv", "deliverables/example.docx"], capture_output=True, text=True, encoding="utf-8")
    if len(ignored.stdout.splitlines()) != 3:
        raise ValueError("Local original/deliverable ignore rules missing")
    if expectGit:
        if runGit("remote", "get-url", "origin") != "https://github.com/Ceeyu-iooi/Semanote-Agent.git":
            raise ValueError("Unexpected origin")
        for branchName in ("main", "develop"):
            runGit("merge-base", "--is-ancestor", "v0.1.0-docs.1", branchName)
        if runGit("status", "--porcelain"):
            print("NOTE working tree has uncommitted changes; review them separately, no clean-state claim.")
    print(f"PASS Git publication allowlist: {len(tracked)} tracked paths; local originals ignored.")


def main():
    """Run checks explicitly requested for this initialization snapshot."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit-data", action="store_true")
    parser.add_argument("--expect-git", action="store_true")
    args = parser.parse_args()
    verifyDocumentation()
    verifyOriginals(args.audit_data)
    verifyGit(args.expect_git)
    print("All requested initialization checks passed; this is not a business-software test.")


if __name__ == "__main__":
    main()
