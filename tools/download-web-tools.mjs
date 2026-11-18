/** Install pinned, vendor-checksummed portable tools inside profile only; existing installations are retained. */
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  writeFile,
  readdir,
  rename,
  unlink,
  rm,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolve, sep } from "node:path";
import { toolRoot, powershell, exists } from "./lib/project.mjs";
async function digest(path, algorithm) {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
async function install(name, version, url, algorithm, expected) {
  const target = resolve(toolRoot, name);
  if (await exists(target)) {
    console.log(name + ": existing installation retained");
    return;
  }
  await mkdir(toolRoot, { recursive: true });
  const temporary = resolve(toolRoot, `.install-${randomUUID()}`),
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
    const actual = await digest(archive, algorithm);
    if (actual !== expected.trim().split(/\s/)[0].toLowerCase())
      throw new Error("Vendor checksum mismatch; no installation performed");
    await powershell(
      "Add-Type -AssemblyName System.IO.Compression.FileSystem; $taskZip=[IO.Compression.ZipFile]::OpenRead($env:SEMANOTE_TOOL_ARCHIVE); try { foreach($taskEntry in $taskZip.Entries){$taskEntryPath=[IO.Path]::GetFullPath((Join-Path $env:SEMANOTE_TOOL_TARGET $taskEntry.FullName)); if(-not $taskEntryPath.StartsWith($env:SEMANOTE_TOOL_TARGET+'\\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe archive path'}} } finally {$taskZip.Dispose()}; Expand-Archive -LiteralPath $env:SEMANOTE_TOOL_ARCHIVE -DestinationPath $env:SEMANOTE_TOOL_TARGET",
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
    await rename(resolve(temporary, entries[0].name), target);
    await writeFile(
      resolve(target, "source.txt"),
      `${url}\n${version}\n${algorithm}: ${actual}\n`,
    );
    console.log(`${name}: installed and vendor checksum verified`);
  } finally {
    if (!temporary.startsWith(toolRoot + sep))
      throw new Error("Unexpected temporary path");
    await rm(temporary, { recursive: true, force: true });
    if (await exists(archive)) await unlink(archive);
  }
}
try {
  const maven = resolve(toolRoot, "maven");
  if (await exists(maven)) console.log("maven: existing installation retained");
  else {
    const url =
        "https://dlcdn.apache.org/maven/maven-3/3.9.16/binaries/apache-maven-3.9.16-bin.zip",
      response = await fetch(url + ".sha512");
    if (!response.ok) throw new Error("Vendor checksum unavailable");
    await install("maven", "3.9.16", url, "sha512", await response.text());
  }
  await install(
    "mysql",
    "8.4.13",
    "https://cdn.mysql.com/Downloads/MySQL-8.4/mysql-8.4.13-winx64.zip",
    "md5",
    "7b94489d5524dea9b27097068bea25a8",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
