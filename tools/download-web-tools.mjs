/** Install verified portable tools in profile, leaving existing installations intact. */
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  writeFile,
  readdir,
  rename,
  unlink,
  rm,
  mkdtemp,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { inflateRaw } from "node:zlib";
import { toolRoot, powershell, exists } from "./lib/project.mjs";
import { deploymentSource } from "./lib/deployment-source.mjs";
import mysqlRuntime from "./lib/mysql-windows-runtime.json" with { type: "json" };

const mavenVersion = "3.9.16";
const mavenPackage = `maven/maven-3/${mavenVersion}/binaries/apache-maven-${mavenVersion}-bin.zip`;
// Apache publishes this SHA-512 alongside the binary ZIP.
const mavenChecksum = "ed41650d42485cfc243fad22158caf9cbb5dc408ce7a09ddb94dd42a019de929ca43065bfa450612cf12bf78b5cafa3884b96c090de326ff590448c933454af3";
const inflate = promisify(inflateRaw);
async function digest(path, algorithm) {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
export async function installMaven(root = toolRoot, source = "cn") {
  const target = resolve(root, "maven");
  if (await exists(target)) {
    console.log("maven: existing installation retained");
    return;
  }
  const mirror = source === "cn" ? "https://repo.huaweicloud.com/apache/" : "https://dlcdn.apache.org/";
  const url = mirror + mavenPackage;
  await mkdir(root, { recursive: true });
  const temporary = resolve(root, `.maven-install-${randomUUID()}`),
    archive = temporary + ".zip";
  await mkdir(temporary);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok)
      throw new Error(`Vendor download HTTP ${response.status}`);
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(archive, { flags: "wx" }),
    );
    const actual = await digest(archive, "sha512");
    if (actual !== mavenChecksum)
      throw new Error("Vendor checksum mismatch; no installation performed");
    await powershell(
      "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; $taskZip=[IO.Compression.ZipFile]::OpenRead($env:SEMANOTE_TOOL_ARCHIVE); try { foreach($taskEntry in $taskZip.Entries){$taskEntryPath=[IO.Path]::GetFullPath((Join-Path $env:SEMANOTE_TOOL_TARGET $taskEntry.FullName)); if(-not $taskEntryPath.StartsWith($env:SEMANOTE_TOOL_TARGET+'\\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe archive path'}} } finally {$taskZip.Dispose()}; [IO.Compression.ZipFile]::ExtractToDirectory($env:SEMANOTE_TOOL_ARCHIVE,$env:SEMANOTE_TOOL_TARGET)",
      {
        env: {
          ...process.env,
          SEMANOTE_TOOL_ARCHIVE: archive,
          SEMANOTE_TOOL_TARGET: temporary,
        },
      },
    );
    const entries = await readdir(temporary, { withFileTypes: true });
    if (entries.length !== 1 || !entries[0].isDirectory())
      throw new Error("Unexpected portable vendor package layout");
    const extracted = resolve(temporary, entries[0].name);
    await writeFile(
      resolve(extracted, "source.txt"),
      `${url}\n${mavenVersion}\nsha512: ${actual}\n`,
    );
    await rename(extracted, target);
    console.log("maven: installed and vendor checksum verified");
  } finally {
    if (!temporary.startsWith(resolve(root) + sep))
      throw new Error("Unexpected temporary path");
    await rm(temporary, { recursive: true, force: true });
    if (await exists(archive)) await unlink(archive);
  }
}
// Each entry pins one payload range from the vendor ZIP and the SHA-256 of its extracted bytes.
async function downloadMysqlFile(file) {
  const range = `${file.offset}-${file.offset + file.compressedSize - 1}`;
  const response = await fetch(mysqlRuntime.url, {
    headers: { Range: "bytes=" + range },
    signal: AbortSignal.timeout(180000),
  });
  if (response.status !== 206 ||
      response.headers.get("content-range") !== `bytes ${range}/${mysqlRuntime.archiveBytes}`) {
    await response.body?.cancel();
    throw new Error(`MySQL CDN did not serve the requested byte range (HTTP ${response.status}).`);
  }
  const compressed = Buffer.from(await response.arrayBuffer());
  if (compressed.length !== file.compressedSize) throw new Error(`Incomplete MySQL download: ${file.path}`);
  const bytes = file.method === 8 ? await inflate(compressed, { maxOutputLength: file.size }) : compressed;
  if (bytes.length !== file.size || createHash("sha256").update(bytes).digest("hex") !== file.sha256)
    throw new Error(`MySQL checksum mismatch: ${file.path}`);
  return bytes;
}

export async function installMysql(root = toolRoot) {
  const target = resolve(root, "mysql");
  if (await exists(target)) {
    console.log("mysql: existing installation retained");
    return;
  }
  await mkdir(root, { recursive: true });
  const temporary = await mkdtemp(resolve(root, ".mysql-install-"));
  try {
    let transferred = 0;
    for (const file of mysqlRuntime.files) {
      const path = resolve(temporary, file.path);
      if (!path.startsWith(temporary + sep)) throw new Error("Unsafe MySQL manifest path");
      const bytes = await downloadMysqlFile(file);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes, { flag: "wx" });
      transferred += file.compressedSize;
    }
    await writeFile(resolve(temporary, "source.txt"),
      `${mysqlRuntime.url}\n${mysqlRuntime.version}\nSHA-256: tools/lib/mysql-windows-runtime.json\n`);
    await rename(temporary, target);
    console.log(`mysql: runtime installed, ${(transferred / 1048576).toFixed(1)} MiB downloaded and verified`);
  } finally {
    if (!temporary.startsWith(resolve(root) + sep)) throw new Error("Unexpected temporary path");
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const source = deploymentSource(process.argv.slice(2));
    await installMaven(toolRoot, source);
    await installMysql();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
