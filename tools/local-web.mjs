/** Windows project-local MySQL, Spring Boot, backup and explicitly authorized LAN lifecycle. */
import { spawn } from "node:child_process";
import {
  open,
  mkdir,
  readFile,
  writeFile,
  unlink,
  stat,
} from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import {
  projectRoot,
  runtimeRoot,
  toolRoot,
  readJson,
  writeJson,
  run,
  powershell,
  getJson,
  delay,
  exists,
} from "./lib/project.mjs";
export { projectRoot, runtimeRoot, toolRoot };

export async function paths() {
  await mkdir(runtimeRoot, { recursive: true });
  const configPath = resolve(runtimeRoot, "local-config.json");
  let config = await readJson(configPath, null);
  if (!config) {
    config = {
      rootPassword: randomBytes(32).toString("hex"),
      appPassword: randomBytes(32).toString("hex"),
    };
    await writeJson(configPath, config);
  }
  if (!config.rootPassword || !config.appPassword)
    throw new Error("Local database configuration is incomplete");
  const defaults = resolve(runtimeRoot, "mysql.cnf"),
    client = resolve(runtimeRoot, "mysql-client.cnf");
  if (!(await exists(defaults))) {
    const content = `[mysqld]\nbasedir=${resolve(toolRoot, "mysql").replaceAll("\\", "/")}\ndatadir=${resolve(runtimeRoot, "mysql-data").replaceAll("\\", "/")}\nbind-address=127.0.0.1\nport=3307\nmysqlx=OFF\ncharacter-set-server=utf8mb4\ncollation-server=utf8mb4_0900_bin\nlog-error=${resolve(runtimeRoot, "mysql-error.log").replaceAll("\\", "/")}\n`;
    // MySQL on Windows reads option-file paths in the native ANSI code page.
    await powershell(
      "[IO.File]::WriteAllText($env:SEMANOTE_OPTION_PATH,[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:SEMANOTE_OPTION_DATA)),[Text.Encoding]::Default)",
      {
        env: {
          ...process.env,
          SEMANOTE_OPTION_PATH: defaults,
          SEMANOTE_OPTION_DATA: Buffer.from(content).toString("base64"),
        },
      },
    );
  }
  await writeFile(
    client,
    `[client]\nhost=127.0.0.1\nport=3307\nuser=root\npassword=${config.rootPassword}\ndefault-character-set=utf8mb4\n`,
    { mode: 0o600 },
  );
  return { config, defaults, client };
}
export async function mysql(args, input) {
  await paths();
  return run(
    resolve(toolRoot, "mysql/bin/mysql.exe"),
    ["--defaults-file=profile/runtime/mysql-client.cnf", ...args],
    { input, check: false },
  );
}

async function launchManaged(command, args, logName, env = process.env, cwd = projectRoot) {
  const log = await open(resolve(runtimeRoot, logName), "a");
  try {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      detached: true,
      stdio: ["ignore", log.fd, log.fd],
    });
    await new Promise((done, fail) => {
      child.once("spawn", done);
      child.once("error", fail);
    });
    child.unref();
    return child.pid;
  } finally {
    await log.close();
  }
}

// MySQL's Windows executable cannot always resolve a Unicode installation path.
// Keep the actual files in place and use only a verified, project-owned drive mapping.
const mysqlDriveRecord = resolve(runtimeRoot, "mysql-drive.json");
async function driveState(letter) {
  const result = await powershell(
    `Add-Type -TypeDefinition 'using System; using System.Text; using System.Runtime.InteropServices; public static class SemanoteDrive { [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern uint QueryDosDevice(string name, StringBuilder target, int max); }'; $b=[Text.StringBuilder]::new(2048); $n=[SemanoteDrive]::QueryDosDevice($env:SEMANOTE_DRIVE,$b,$b.Capacity); if (!$n) { 'free' } elseif ($b.ToString().Equals(('\\??\\'+$env:SEMANOTE_TARGET),[StringComparison]::OrdinalIgnoreCase)) { 'match' } else { 'occupied' }`,
    { env: { ...process.env, SEMANOTE_DRIVE: `${letter}:`, SEMANOTE_TARGET: projectRoot } },
  );
  return result.stdout.toString("utf8").trim();
}
async function mysqlDrive() {
  const record = await readJson(mysqlDriveRecord, null);
  if (record && (!/^[D-Z]$/.test(record.letter) || record.projectRoot !== projectRoot))
    throw new Error("Invalid MySQL drive mapping record");
  const candidates = record ? [record.letter] : "ZYXWVUTSRQPONMLKJIHGFED".split("");
  for (const letter of candidates) {
    const state = await driveState(letter);
    if (state === "occupied" || (state === "match" && !record)) continue;
    if (state === "free") {
      const result = await run("subst.exe", [`${letter}:`, projectRoot], { check: false });
      if (result.code !== 0 || await driveState(letter) !== "match")
        throw new Error("Could not create the project MySQL drive mapping");
      try { await writeJson(mysqlDriveRecord, { letter, projectRoot }); }
      catch (error) { await run("subst.exe", [`${letter}:`, "/D"], { check: false }); throw error; }
    }
    return `${letter}:`;
  }
  throw new Error("No verified drive is available for project MySQL");
}

export function rewriteMysqlOptions(content, drive) {
  for (const [key, expected, replacement] of [
    ["basedir", resolve(toolRoot, "mysql"), `${drive}/profile/tools/mysql`],
    ["datadir", resolve(runtimeRoot, "mysql-data"), `${drive}/profile/runtime/mysql-data`],
  ]) {
    const pattern = new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*([^\\r\\n]+?)[ \\t]*(?=\\r?$)`, "im");
    const match = content.match(pattern);
    if (!match || resolve(match[1].replace(/^['"]|['"]$/g, "")).toLowerCase() !== expected.toLowerCase())
      throw new Error(`MySQL ${key} does not match the project directory`);
    content = content.replace(pattern, `${key}=${replacement}`);
  }
  // Preserve all other configured options; only remap the standard project log path.
  const log = /^[ \t]*log-error[ \t]*=[ \t]*([^\r\n]+?)[ \t]*(?=\r?$)/im;
  const found = content.match(log);
  if (found && resolve(found[1].replace(/^['"]|['"]$/g, "")).toLowerCase() === resolve(runtimeRoot, "mysql-error.log").toLowerCase())
    content = content.replace(log, `log-error=${drive}/profile/runtime/mysql-error.log`);
  return content;
}
async function mappedMysqlConfig(drive) {
  const optionPath = resolve(runtimeRoot, "mysql-managed.cnf");
  const bytes = await readFile(resolve(runtimeRoot, "mysql.cnf"));
  let content;
  try { content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { content = new TextDecoder("gbk", { fatal: true }).decode(bytes); }
  content = rewriteMysqlOptions(content, drive);
  await writeFile(optionPath, content, { encoding: "utf8", mode: 0o600 });
  return `${drive}/profile/runtime/mysql-managed.cnf`;
}
export async function startDatabase() {
  const { config } = await paths();
  if ((await mysql(["--execute=SELECT 1"])).code === 0) {
    console.log("MySQL ready on 127.0.0.1:3307");
    return;
  }
  const dataRoot = resolve(runtimeRoot, "mysql-data");
  let initialize = false;
  try {
    await stat(dataRoot);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    initialize = true;
  }
  const drive = /[^\x00-\x7f]/.test(projectRoot) ? await mysqlDrive() : null;
  const executable = drive
    ? `${drive}\\profile\\tools\\mysql\\bin\\mysqld.exe`
    : resolve(toolRoot, "mysql/bin/mysqld.exe");
  const option = drive
    ? await mappedMysqlConfig(drive)
    : "profile/runtime/mysql.cnf";
  if (initialize)
    await run(executable, [
      `--defaults-file=${option}`,
      "--initialize-insecure",
      "--console",
    ], { cwd: drive ? `${drive}\\` : projectRoot });
  const initFile = resolve(runtimeRoot, "mysql-init.sql");
  if (initialize) {
    if (
      !/^[\w-]+$/.test(config.rootPassword) ||
      !/^[\w-]+$/.test(config.appPassword)
    )
      throw new Error("Unsupported initialization credential encoding");
    await writeFile(
      initFile,
      `ALTER USER 'root'@'localhost' IDENTIFIED BY '${config.rootPassword}';\nCREATE DATABASE semanote CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;\nCREATE USER 'semanote'@'localhost' IDENTIFIED BY '${config.appPassword}';\nGRANT SELECT,INSERT,UPDATE,DELETE,CREATE,REFERENCES,INDEX,ALTER ON semanote.* TO 'semanote'@'localhost';\n`,
      { mode: 0o600 },
    );
  }
  const args = [`--defaults-file=${option}`, "--console"];
  if (await exists(initFile)) args.push(drive ? `--init-file=${drive}/profile/runtime/mysql-init.sql` : "--init-file=../mysql-init.sql");
  const pid = await launchManaged(executable, args, "mysql-process.log", process.env, drive ? `${drive}\\` : projectRoot);
  await writeJson(resolve(runtimeRoot, "mysql-pid.json"), { pid, drive });
  for (let i = 0; i < 100; i++) {
    if ((await mysql(["--execute=SELECT 1"])).code === 0) {
      if (await exists(initFile)) await unlink(initFile);
      console.log("MySQL ready on 127.0.0.1:3307");
      return;
    }
    await delay(300);
  }
  throw new Error("MySQL did not become ready; inspect the local project log");
}
export async function lanInterfaces() {
  const output = await powershell(
    "Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.NetAdapter.HardwareInterface -and $_.IPv4DefaultGateway } | ForEach-Object { $taskInterface=$_; $_.IPv4Address | ForEach-Object { [pscustomobject]@{ address=$_.IPAddress; prefixLength=$_.PrefixLength; interfaceAlias=$taskInterface.InterfaceAlias } } } | ConvertTo-Json -Compress",
  );
  const parsed = output.stdout.toString("utf8").trim();
  const entries = parsed ? JSON.parse(parsed) : [];
  return (Array.isArray(entries) ? entries : [entries])
    .filter((item) =>
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address),
    )
    .map((item) => {
      const number = item.address
        .split(".")
        .reduce((value, part) => (value * 256 + Number(part)) >>> 0, 0);
      const mask = (0xffffffff << (32 - item.prefixLength)) >>> 0,
        network = (number & mask) >>> 0;
      return {
        ...item,
        subnet: `${[24, 16, 8, 0].map((shift) => (network >>> shift) & 255).join(".")}/${item.prefixLength}`,
      };
    });
}
export async function backendEnvironment() {
  const { config } = await paths();
  const env = {
    ...process.env,
    SEMANOTE_PROJECT_ROOT: projectRoot,
    SEMANOTE_NODE: process.execPath,
    SEMANOTE_DB_PASSWORD: config.appPassword,
    SEMANOTE_DB_USER: "semanote",
  };
  if (config.networkMode === "lan") {
    const interfaces = await lanInterfaces();
    if (!interfaces.length)
      throw new Error("No connected private physical LAN interface");
    config.lanInterfaces = interfaces;
    await writeJson(resolve(runtimeRoot, "local-config.json"), config);
    Object.assign(env, {
      SEMANOTE_BIND_ADDRESS: "0.0.0.0",
      SEMANOTE_LAN_HOSTS: interfaces.map((item) => item.address).join(","),
    });
  } else
    Object.assign(env, {
      SEMANOTE_BIND_ADDRESS: "127.0.0.1",
      SEMANOTE_LAN_HOSTS: "",
    });
  return env;
}
const releasePort = 8090, developmentPort = 8081;
const backendRecord = resolve(runtimeRoot, "backend-pid.json");
const previousNodeEntry = resolve(projectRoot, "backend/server.mjs");
export async function releaseArtifact() {
  const version = (await readFile(resolve(projectRoot, "VERSION"), "utf8")).trim();
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error("Invalid release version");
  return resolve(projectRoot, "backend/target/semanote-web-" + version + ".jar");
}
function ownedBackend(record, command) {
  const artifact = record?.artifact;
  if (!artifact) return command.includes(previousNodeEntry);
  return typeof artifact === "string" && resolve(artifact).startsWith(resolve(projectRoot, "backend/target") + sep)
    && command.includes(artifact);
}
const healthUrl = (port) => "http://127.0.0.1:" + port + "/api/v1/health";
async function printWebAddresses(port) {
  console.log("Web ready: http://127.0.0.1:" + port);
  const { config } = await paths();
  if (port === releasePort && config.networkMode === "lan")
    for (const item of config.lanInterfaces || [])
      console.log(`LAN address: http://${item.address}:${port}`);
}
async function activeProcess(record) {
  if (!Number.isInteger(record?.pid) || record.pid < 1) return "";
  const result = await powershell(
    `Get-CimInstance Win32_Process -Filter 'ProcessId=${record.pid}' | Select-Object -ExpandProperty CommandLine`,
  );
  return result.stdout.toString("utf8");
}
export async function startBackend(port = releasePort) {
  const record = await readJson(backendRecord, null);
  const artifact = await releaseArtifact();
  if (record && ownedBackend(record, await activeProcess(record))) {
    if (record.artifact !== artifact) throw new Error("Stop the previous Semanote backend before upgrading");
    if (record.port !== port) throw new Error("Stop the existing Semanote backend before switching modes");
    const health = await getJson(healthUrl(port));
    if (health.runtime !== "spring") throw new Error("The port is not serving Spring Boot");
    await printWebAddresses(port);
    return;
  }
  for (const candidate of [releasePort, developmentPort]) {
    const health = await getJson(healthUrl(candidate)).catch(() => null);
    if (health?.status === "ready") throw new Error("A Semanote process already uses port " + candidate);
  }
  if (!(await exists(resolve(projectRoot, "frontend/dist/index.html"))) ||
      !(await exists(artifact)))
    throw new Error("Build the project first: node tools/build-web.mjs");
  await startDatabase();
  const env = await backendEnvironment();
  if (port === developmentPort) Object.assign(env, { SEMANOTE_BIND_ADDRESS: "127.0.0.1", SEMANOTE_LAN_HOSTS: "" });
  const token = randomBytes(32).toString("hex");
  const pid = await launchManaged("java", ["-jar", artifact], "backend-spring.log", {
    ...env, SEMANOTE_PORT: String(port), SEMANOTE_MANAGED_TOKEN: token,
  });
  await writeJson(backendRecord, { pid, port, token, artifact });
  for (let i = 0; i < 100; i++) {
    const health = await getJson(healthUrl(port), { signal: AbortSignal.timeout(1000) }).catch(() => null);
    if (health?.runtime === "spring") { await printWebAddresses(port); return; }
    await delay(300);
  }
  throw new Error("Backend did not become ready; inspect profile/runtime/backend-spring.log");
}
export async function stopBackend() {
  const record = await readJson(backendRecord, null);
  if (!record) return;
  const command = await activeProcess(record);
  if (ownedBackend(record, command) && [releasePort, developmentPort].includes(record.port) && /^[a-f0-9]{64}$/.test(record.token)) {
    const url = healthUrl(record.port).replace("/health", "/shutdown");
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Semanote-Managed-Token": record.token },
      body: JSON.stringify({ confirm: true, database: false }), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("The backend did not stop. Wait for current jobs or imports to finish.");
    for (let attempt = 0; attempt < 30 && ownedBackend(record, await activeProcess(record)); attempt++) await delay(100);
    if (ownedBackend(record, await activeProcess(record))) throw new Error("The backend is still stopping");
    console.log("Project backend stopped");
  } else if (record.artifact && ownedBackend(record, command)) {
    // Compatibility for an active process recorded by a previous release.
    process.kill(record.pid);
    console.log("Previous project backend stopped");
  }
  await unlink(backendRecord);
}

/** Stop only the MySQL listener launched by this checkout. */
export async function stopDatabase({ backendDrained = false } = {}) {
  if (!backendDrained) for (const port of [releasePort, developmentPort]) {
    if ((await getJson(healthUrl(port)).catch(() => null))?.status === "ready")
      throw new Error("Stop the project backend before stopping MySQL");
  }
  const recordPath = resolve(runtimeRoot, "mysql-pid.json");
  const record = await readJson(recordPath, null);
  if (!Number.isInteger(record?.pid) || record.pid < 1)
    throw new Error("Cannot verify ownership of the project MySQL instance");
  const mapping = record.drive ? await readJson(mysqlDriveRecord, null) : null;
  if (record.drive && (!mapping || mapping.projectRoot !== projectRoot ||
      !/^[D-Z]$/.test(mapping.letter) || record.drive !== `${mapping.letter}:` ||
      await driveState(mapping.letter) !== "match"))
    throw new Error("Cannot verify ownership of the project MySQL drive");
  const toolDirectory = mapping ? `${record.drive}\\profile\\tools\\mysql\\bin` : resolve(toolRoot, "mysql/bin");
  const optionName = mapping ? "mysql-managed.cnf" : "mysql.cnf";
  const check = await powershell(
    `$listener=Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 3307 -State Listen -ErrorAction Stop | Select-Object -First 1; $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener.OwningProcess); if ($p -and ($p.ProcessId -eq [int]$env:SEMANOTE_MYSQL_PID -or $p.ParentProcessId -eq [int]$env:SEMANOTE_MYSQL_PID) -and $p.CommandLine.TrimStart([char]34).StartsWith($env:SEMANOTE_MYSQL_EXE,[StringComparison]::OrdinalIgnoreCase) -and $p.CommandLine.Contains($env:SEMANOTE_MYSQL_OPTION)) { 'owned' } else { 'other' }`,
    { env: { ...process.env, SEMANOTE_MYSQL_PID: String(record.pid), SEMANOTE_MYSQL_EXE: resolve(toolDirectory, "mysqld.exe"), SEMANOTE_MYSQL_OPTION: optionName } },
  );
  if (check.stdout.toString("utf8").trim() !== "owned")
    throw new Error("The MySQL listener does not match the managed process");
  await run(resolve(toolDirectory, "mysqladmin.exe"),
    [`--defaults-file=${mapping ? record.drive + "/" : ""}profile/runtime/mysql-client.cnf`, "shutdown"],
    { cwd: mapping ? `${record.drive}\\` : projectRoot });
  if (mapping) {
    if (await driveState(mapping.letter) !== "match")
      throw new Error("MySQL stopped, but its drive mapping changed and was retained");
    await run("subst.exe", [`${mapping.letter}:`, "/D"]);
    await unlink(mysqlDriveRecord);
  }
  await unlink(recordPath);
  console.log("Project MySQL stopped");
}
export async function backupDatabase() {
  await startDatabase();
  const directory = resolve(projectRoot, "profile/backups");
  await mkdir(directory, { recursive: true });
  const path = resolve(
    directory,
    `semanote-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`,
  );
  const file = await open(path, "wx");
  try {
    const child = spawn(
      resolve(toolRoot, "mysql/bin/mysqldump.exe"),
      [
        "--defaults-file=profile/runtime/mysql-client.cnf",
        "--single-transaction",
        "--no-tablespaces",
        "--set-gtid-purged=OFF",
        "semanote",
      ],
      {
        cwd: projectRoot,
        windowsHide: true,
        stdio: ["ignore", file.fd, "ignore"],
      },
    );
    const code = await new Promise((done, fail) => {
      child.on("error", fail);
      child.on("close", done);
    });
    if (code !== 0)
      throw new Error("SQL backup failed; do not use the new file");
  } finally {
    await file.close();
  }
  console.log("SQL backup created: " + path);
  return path;
}
export async function setNetworkMode(mode) {
  const { config } = await paths();
  if (mode === "lan" && !(await lanInterfaces()).length)
    throw new Error("No connected private physical LAN interface");
  config.networkMode = mode;
  await writeJson(resolve(runtimeRoot, "local-config.json"), config);
  await stopBackend();
  await startBackend();
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const actions = {
    database: startDatabase,
    start: startBackend,
    dev: () => startBackend(developmentPort),
    stop: stopBackend,
    "stop-database": stopDatabase,
    "shutdown-managed-database": async () => {
      const record = await readJson(backendRecord, null);
      if (!record?.artifact || record.pid !== process.ppid || record.token !== process.env.SEMANOTE_MANAGED_TOKEN
          || !/^[a-f0-9]{64}$/.test(record.token) || !ownedBackend(record, await activeProcess(record)))
        throw new Error("Managed database shutdown requires the verified backend process");
      await stopDatabase({ backendDrained: true });
    },
    backup: backupDatabase,
    lan: () => setNetworkMode("lan"),
    local: () => setNetworkMode("local"),
  };
  try {
    const action = actions[process.argv[2]];
    if (!action)
      throw new Error("Use database, start, dev, stop, stop-database, backup, lan or local");
    await action();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
