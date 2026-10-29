"""Rebuild Vue assets and the Spring JAR from locked dependencies."""
import os
from pathlib import Path
import subprocess
import sys

projectRoot = Path(__file__).resolve().parent.parent
creationFlags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def run(arguments, directory):
    """Use separate arguments and keep configuration in the environment."""
    result = subprocess.run(arguments, cwd=directory, capture_output=True, creationflags=creationFlags)
    if result.stdout: print(result.stdout.decode("utf-8", errors="replace"), end="", flush=True)
    if result.stderr: print(result.stderr.decode("utf-8", errors="replace"), end="", file=sys.stderr, flush=True)
    result.check_returncode()


if __name__ == "__main__":
    frontendRoot = projectRoot / "frontend"
    if not (frontendRoot / "node_modules/vite").exists():
        run(["npm.cmd", "ci", "--no-audit", "--no-fund"], frontendRoot)
    run(["npm.cmd", "run", "build"], frontendRoot)
    run([sys.executable, "-X", "utf8", "-B", "tools/sync_reference.py"], projectRoot)
    maven = projectRoot / "profile/tools/maven/bin/mvn.cmd"
    run([str(maven), "-f", "backend/pom.xml", "-Dmaven.repo.local=" + str(projectRoot / "profile/maven-repository"), "package", "-q"], projectRoot)
    print("Built frontend/dist and backend/target/semanote-web-0.1.1.jar")
