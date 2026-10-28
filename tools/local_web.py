"""Manage local MySQL, configurable Web visibility, and SQL backups for this checkout."""

import argparse
import ipaddress
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import urllib.request

projectRoot = Path(__file__).resolve().parent.parent
runtimeRoot = projectRoot / "profile/runtime"
toolRoot = projectRoot / "profile/tools"
creationFlags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def paths():
    runtimeRoot.mkdir(parents=True, exist_ok=True)
    configPath = runtimeRoot / "local-config.json"
    if not configPath.exists():
        configPath.write_text(json.dumps({"rootPassword": secrets.token_urlsafe(32), "appPassword": secrets.token_urlsafe(32)}, indent=2), encoding="utf-8")
    config = json.loads(configPath.read_text(encoding="utf-8"))
    defaults = runtimeRoot / "mysql.cnf"
    # Windows MySQL reads option-file paths with its native ANSI code page.
    defaults.write_text("[mysqld]\nbasedir=" + (toolRoot / "mysql").as_posix() + "\ndatadir=" + (runtimeRoot / "mysql-data").as_posix() + "\nbind-address=127.0.0.1\nport=3307\nmysqlx=OFF\ncharacter-set-server=utf8mb4\ncollation-server=utf8mb4_0900_bin\nlog-error=" + (runtimeRoot / "mysql-error.log").as_posix() + "\n", encoding="mbcs" if os.name == "nt" else "utf-8")
    client = runtimeRoot / "mysql-client.cnf"
    client.write_text("[client]\nhost=127.0.0.1\nport=3307\nuser=root\npassword=" + config["rootPassword"] + "\ndefault-character-set=utf8mb4\n", encoding="utf-8")
    return config, defaults, client


def mysql(arguments, inputBytes=None):
    _, _, client = paths()
    return subprocess.run(["profile/tools/mysql/bin/mysql.exe", "--defaults-file=profile/runtime/mysql-client.cnf", *arguments], cwd=projectRoot, input=inputBytes, capture_output=True, creationflags=creationFlags)


def startDatabase():
    config, defaults, _ = paths()
    if mysql(["--execute=SELECT 1"]).returncode == 0:
        print("MySQL ready on 127.0.0.1:3307", flush=True)
        return
    dataRoot = runtimeRoot / "mysql-data"
    initialize = not dataRoot.exists()
    executable = "profile/tools/mysql/bin/mysqld.exe"
    if initialize:
        result = subprocess.run([executable, "--defaults-file=profile/runtime/mysql.cnf", "--initialize-insecure", "--console"], cwd=projectRoot, capture_output=True, creationflags=creationFlags)
        if result.returncode:
            raise RuntimeError("MySQL initialization failed; see profile/runtime/mysql-error.log")
    # --console avoids MySQL's Windows service argument parser truncating CJK paths.
    arguments = [executable, "--defaults-file=profile/runtime/mysql.cnf", "--console"]
    initFile = runtimeRoot / "mysql-init.sql"
    if initialize:
        initFile.write_text("ALTER USER 'root'@'localhost' IDENTIFIED BY '" + config["rootPassword"] + "';\nCREATE DATABASE semanote CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;\nCREATE USER 'semanote'@'localhost' IDENTIFIED BY '" + config["appPassword"] + "';\nGRANT SELECT,INSERT,UPDATE,DELETE,CREATE,REFERENCES,INDEX,ALTER ON semanote.* TO 'semanote'@'localhost';\n", encoding="utf-8")
    if initFile.exists():
        # MySQL resolves init-file after switching its working directory to datadir.
        arguments.append("--init-file=../mysql-init.sql")
    with (runtimeRoot / "mysql-process.log").open("ab") as log:
        process = subprocess.Popen(arguments, cwd=projectRoot, stdout=log, stderr=log, creationflags=creationFlags)
    (runtimeRoot / "mysql-pid.json").write_text(json.dumps({"pid": process.pid}), encoding="utf-8")
    for _ in range(100):
        if mysql(["--execute=SELECT 1"]).returncode == 0:
            if initFile.exists(): initFile.unlink()
            print("MySQL ready on 127.0.0.1:3307", flush=True)
            return
        if process.poll() is not None: raise RuntimeError("MySQL startup failed; see local logs")
        time.sleep(0.3)
    raise RuntimeError("MySQL startup did not become ready")


def backendEnvironment():
    config, _, _ = paths()
    environment = dict(os.environ)
    environment.update({"SEMANOTE_PROJECT_ROOT": str(projectRoot), "SEMANOTE_PYTHON": os.sys.executable,
                        "SEMANOTE_DB_PASSWORD": config["appPassword"], "SEMANOTE_DB_USER": "semanote"})
    if config.get("networkMode") == "lan":
        interfaces = lanInterfaces()
        if not interfaces: raise RuntimeError("No connected private physical LAN interface was found")
        config["lanInterfaces"] = interfaces
        (runtimeRoot / "local-config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
        environment.update({"SEMANOTE_BIND_ADDRESS": "0.0.0.0", "SEMANOTE_LAN_HOSTS": ",".join(item["address"] for item in interfaces)})
    else:
        environment.update({"SEMANOTE_BIND_ADDRESS": "127.0.0.1", "SEMANOTE_LAN_HOSTS": ""})
    return environment


def lanInterfaces():
    """Discover private IPv4 on connected physical adapters, excluding VPN/VM interfaces."""
    command = "Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.NetAdapter.HardwareInterface -and $_.IPv4DefaultGateway } | ForEach-Object { $taskInterface=$_; $_.IPv4Address | ForEach-Object { [pscustomobject]@{ address=$_.IPAddress; prefixLength=$_.PrefixLength; interfaceAlias=$taskInterface.InterfaceAlias } } } | ConvertTo-Json -Compress"
    result = subprocess.run(["powershell", "-NoProfile", "-Command", command], capture_output=True, text=True, encoding="mbcs", creationflags=creationFlags, check=True)
    entries = json.loads(result.stdout) if result.stdout.strip() else []
    if isinstance(entries, dict): entries = [entries]
    interfaces = []
    for item in entries:
        address = ipaddress.ip_address(item["address"])
        if address.version == 4 and address.is_private and not (address.is_loopback or address.is_link_local):
            item["subnet"] = str(ipaddress.ip_network(f'{address}/{item["prefixLength"]}', strict=False))
            interfaces.append(item)
    return interfaces


def printWebAddresses():
    print("Web ready: http://127.0.0.1:8080", flush=True)
    config, _, _ = paths()
    if config.get("networkMode") == "lan":
        for item in config.get("lanInterfaces", []):
            print("LAN address: http://" + item["address"] + ":8080", flush=True)


def setNetworkMode(mode):
    """Persist only this workspace's web visibility; MySQL stays on loopback."""
    config, _, _ = paths()
    if mode == "lan" and not lanInterfaces(): raise RuntimeError("No connected private physical LAN interface was found")
    config["networkMode"] = mode
    (runtimeRoot / "local-config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    stopBackend()
    startBackend()


def startBackend():
    startDatabase()
    try:
        with urllib.request.urlopen("http://127.0.0.1:8080/api/v1/health", timeout=2) as response:
            if json.load(response).get("status") == "ready":
                printWebAddresses()
                return
    except Exception:
        pass
    artifact = projectRoot / "backend/target/semanote-web-0.1.0-SNAPSHOT.jar"
    if not artifact.exists(): raise RuntimeError("Build backend first; see docs/web-usage.md")
    with (runtimeRoot / "backend.log").open("ab") as log:
        process = subprocess.Popen(["java", "-jar", str(artifact)], cwd=projectRoot, env=backendEnvironment(), stdout=log, stderr=log, creationflags=creationFlags)
    (runtimeRoot / "backend-pid.json").write_text(json.dumps({"pid": process.pid, "artifact": str(artifact)}), encoding="utf-8")
    for _ in range(100):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8080/api/v1/health", timeout=2) as response:
                if json.load(response).get("status") == "ready":
                    printWebAddresses()
                    return
        except Exception:
            pass
        if process.poll() is not None: raise RuntimeError("Backend startup failed; see profile/runtime/backend.log")
        time.sleep(0.3)
    raise RuntimeError("Backend startup did not become ready")


def backupDatabase():
    startDatabase()
    _, _, client = paths()
    backupRoot = projectRoot / "profile/backups"
    backupRoot.mkdir(parents=True, exist_ok=True)
    destination = backupRoot / ("semanote-" + time.strftime("%Y%m%d-%H%M%S") + ".sql")
    with destination.open("xb") as output:
        result = subprocess.run(["profile/tools/mysql/bin/mysqldump.exe", "--defaults-file=profile/runtime/mysql-client.cnf", "--single-transaction", "--no-tablespaces", "--set-gtid-purged=OFF", "semanote"], cwd=projectRoot, stdout=output, stderr=subprocess.PIPE, creationflags=creationFlags)
    if result.returncode: raise RuntimeError("SQL backup failed; do not treat the new file as a valid backup")
    print("SQL backup created: " + str(destination), flush=True)


def stopBackend():
    recordPath = runtimeRoot / "backend-pid.json"
    if recordPath.exists():
        record = json.loads(recordPath.read_text(encoding="utf-8"))
        # Check executable identity and the exact project JAR before stopping anything.
        command = "Get-CimInstance Win32_Process -Filter 'ProcessId=" + str(int(record["pid"])) + "' | Select-Object -ExpandProperty CommandLine"
        result = subprocess.run(["powershell", "-NoProfile", "-Command", command], capture_output=True, text=True, encoding="mbcs" if os.name == "nt" else "utf-8", creationflags=creationFlags)
        if record["artifact"] in result.stdout:
            subprocess.run(["powershell", "-NoProfile", "-Command", "Stop-Process -Id " + str(int(record["pid"]))], check=True, creationflags=creationFlags)
            print("Project backend stopped", flush=True)
        recordPath.unlink()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["database", "start", "stop", "backup", "lan", "local"])
    arguments = parser.parse_args()
    {"database": startDatabase, "start": startBackend, "stop": stopBackend, "backup": backupDatabase,
     "lan": lambda: setNetworkMode("lan"), "local": lambda: setNetworkMode("local")}[arguments.action]()
