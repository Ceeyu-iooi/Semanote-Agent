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
import { resolve } from "node:path";
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

async function launchManaged(command, args, logName, env = process.env) {
  const log = await open(resolve(runtimeRoot, logName), "a");
  try {
    const child = spawn(command, args, {
      cwd: projectRoot,
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
  const executable = resolve(toolRoot, "mysql/bin/mysqld.exe");
  if (initialize)
    await run(executable, [
      "--defaults-file=profile/runtime/mysql.cnf",
      "--initialize-insecure",
      "--console",
    ]);
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
  const args = ["--defaults-file=profile/runtime/mysql.cnf", "--console"];
  if (await exists(initFile)) args.push("--init-file=../mysql-init.sql");
  const pid = await launchManaged(executable, args, "mysql-process.log");
  await writeJson(resolve(runtimeRoot, "mysql-pid.json"), { pid });
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
async function printWebAddresses() {
  console.log("Web ready: http://127.0.0.1:8080");
  const { config } = await paths();
  if (config.networkMode === "lan")
    for (const item of config.lanInterfaces || [])
      console.log(`LAN address: http://${item.address}:8080`);
}
export async function releaseArtifact() {
  const version = (
    await readFile(resolve(projectRoot, "VERSION"), "utf8")
  ).trim();
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version))
    throw new Error("Invalid product version");
  return resolve(projectRoot, `backend/target/semanote-web-${version}.jar`);
}
export async function startBackend() {
  await startDatabase();
  try {
    if (
      (await getJson("http://127.0.0.1:8080/api/v1/health")).status === "ready"
    ) {
      await printWebAddresses();
      return;
    }
  } catch {}
  const artifact = await releaseArtifact();
  if (!(await exists(artifact)))
    throw new Error("Build the project first: node tools/build-web.mjs");
  const pid = await launchManaged(
    "java",
    ["-jar", artifact],
    "backend.log",
    await backendEnvironment(),
  );
  await writeJson(resolve(runtimeRoot, "backend-pid.json"), { pid, artifact });
  for (let i = 0; i < 100; i++) {
    try {
      if (
        (
          await getJson("http://127.0.0.1:8080/api/v1/health", {
            signal: AbortSignal.timeout(2000),
          })
        ).status === "ready"
      ) {
        await printWebAddresses();
        return;
      }
    } catch {}
    await delay(300);
  }
  throw new Error(
    "Backend did not become ready; inspect profile/runtime/backend.log",
  );
}
export async function stopBackend() {
  const recordPath = resolve(runtimeRoot, "backend-pid.json"),
    record = await readJson(recordPath, null);
  if (!record) return;
  if (
    !Number.isInteger(record.pid) ||
    record.pid < 1 ||
    !resolve(record.artifact).startsWith(projectRoot + "\\")
  )
    throw new Error("Invalid managed backend identity");
  const output = await powershell(
    `Get-CimInstance Win32_Process -Filter 'ProcessId=${record.pid}' | Select-Object -ExpandProperty CommandLine`,
  );
  if (output.stdout.toString("utf8").includes(record.artifact)) {
    process.kill(record.pid);
    console.log("Project backend stopped");
  }
  await unlink(recordPath);
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
    stop: stopBackend,
    backup: backupDatabase,
    lan: () => setNetworkMode("lan"),
    local: () => setNetworkMode("local"),
  };
  try {
    const action = actions[process.argv[2]];
    if (!action)
      throw new Error("Use database, start, stop, backup, lan or local");
    await action();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
