/** Install verified portable tools in profile, leaving existing installations intact. */
import {
  mkdir,
  writeFile,
  rename,
  rm,
  mkdtemp,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { inflateRaw } from "node:zlib";
import { toolRoot, exists } from "./lib/project.mjs";
import { deploymentSource } from "./lib/deployment-source.mjs";
import mysqlRuntime from "./lib/mysql-windows-runtime.json" with { type: "json" };

const inflate = promisify(inflateRaw);
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
    deploymentSource(process.argv.slice(2));
    await installMysql();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
