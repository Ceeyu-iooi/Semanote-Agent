"""Fetch pinned official portable tools inside this checkout only."""

from concurrent.futures import ThreadPoolExecutor
import hashlib
from pathlib import Path
import urllib.request
import zipfile

projectRoot = Path(__file__).resolve().parent.parent
toolRoot = projectRoot / "profile/tools"


def installTool(name, version, url, algorithm, expectedDigest):
    """Verify the vendor archive before extracting a new stable directory."""
    target = toolRoot / name
    if target.exists():
        print(name + ": existing directory retained", flush=True)
        return
    toolRoot.mkdir(parents=True, exist_ok=True)
    archive = toolRoot / (name + ".download.zip")
    with urllib.request.urlopen(url, timeout=60) as response, archive.open("wb") as output:
        while block := response.read(1024 * 1024):
            output.write(block)
    with archive.open("rb") as source:
        actualDigest = hashlib.file_digest(source, algorithm).hexdigest()
    if actualDigest != expectedDigest.strip().split()[0].lower():
        raise ValueError(name + ": vendor checksum mismatch")
    target.mkdir()
    with zipfile.ZipFile(archive) as package:
        for entry in package.infolist():
            relative = Path(*Path(entry.filename).parts[1:])
            if not relative.parts:
                continue
            destination = (target / relative).resolve()
            if not destination.is_relative_to(target.resolve()):
                raise ValueError("Unsafe archive path")
            if entry.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                with package.open(entry) as source, destination.open("xb") as output:
                    while block := source.read(1024 * 1024):
                        output.write(block)
    (target / "source.txt").write_text(f"{url}\n{version}\n{algorithm}: {actualDigest}\n", encoding="utf-8")
    archive.unlink()
    print(name + ": installed and checksum verified", flush=True)


if __name__ == "__main__":
    mavenUrl = "https://dlcdn.apache.org/maven/maven-3/3.9.16/binaries/apache-maven-3.9.16-bin.zip"
    mavenDigest = urllib.request.urlopen(mavenUrl + ".sha512", timeout=30).read().decode("ascii")
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(installTool, "maven", "3.9.16", mavenUrl, "sha512", mavenDigest),
            executor.submit(installTool, "mysql", "8.4.13", "https://cdn.mysql.com/Downloads/MySQL-8.4/mysql-8.4.13-winx64.zip", "md5", "7b94489d5524dea9b27097068bea25a8"),
        ]
        for future in futures:
            future.result()
