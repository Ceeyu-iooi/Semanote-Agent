/** Exercise the real Java/JDBC/JavaScript chain in databases created solely for this run. */
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  projectRoot,
  runtimeRoot,
  toolRoot,
  startDatabase,
  mysql,
  backendEnvironment,
  releaseArtifact,
} from "./local-web.mjs";
import { writeJson, delay, run } from "./lib/project.mjs";
const databaseName =
    "semanote_verify_" + randomUUID().replaceAll("-", "").slice(0, 12),
  restoreName = databaseName + "_restore";
const receiptRoot = resolve(projectRoot, "profile/verification/immersive");
await mkdir(receiptRoot, { recursive: true });
const checks = [];
let processHandle = null,
  created = false,
  restoreCreated = false;
function check(name, condition) {
  if (!condition) throw new Error(name);
  checks.push(name);
  console.log("PASS " + name);
}
function call(path, body = null, method = "GET", headers = {}, raw = null) {
  return new Promise((done, fail) => {
    const payload =
        raw ?? (body === null ? null : Buffer.from(JSON.stringify(body))),
      request = httpRequest(
        {
          hostname: "127.0.0.1",
          port: 8081,
          path: "/api/v1" + path,
          method: body !== null && method === "GET" ? "POST" : method,
          headers: {
            "Content-Type": "application/json",
            ...(payload ? { "Content-Length": payload.length } : {}),
            ...headers,
          },
        },
        (response) => {
          const buffers = [];
          let bytes = 0;
          response.on("data", (buffer) => {
            bytes += buffer.length;
            if (bytes > 32 * 1024 * 1024) {
              request.destroy(new Error("Response limit"));
              return;
            }
            buffers.push(buffer);
          });
          response.on("end", () => {
            try {
              done({
                code: response.statusCode,
                data: JSON.parse(Buffer.concat(buffers).toString("utf8")),
              });
            } catch (error) {
              fail(error);
            }
          });
        },
      );
    request.setTimeout(30000, () =>
      request.destroy(new Error("HTTP check timed out")),
    );
    request.on("error", fail);
    request.end(payload);
  });
}
async function start() {
  const environment = {
    ...(await backendEnvironment()),
    SEMANOTE_SEED_CORPUS: "false",
    SEMANOTE_PORT: "8081",
    SEMANOTE_BIND_ADDRESS: "127.0.0.1",
    SEMANOTE_LAN_HOSTS: "",
    SEMANOTE_DB_URL: `jdbc:mysql://127.0.0.1:3307/${databaseName}?characterEncoding=UTF-8&serverTimezone=UTC`,
  };
  const log = createWriteStream(resolve(receiptRoot, "isolated-backend.log"), {
    flags: "a",
  });
  processHandle = spawn("java", ["-jar", await releaseArtifact()], {
    cwd: projectRoot,
    env: environment,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  processHandle.stdout.pipe(log, { end: false });
  processHandle.stderr.pipe(log, { end: false });
  processHandle.once("close", () => log.end());
  await new Promise((done, fail) => {
    processHandle.once("spawn", done);
    processHandle.once("error", fail);
  });
  let lastStatus = "not connected";
  for (let i = 0; i < 150; i++) {
    try {
      const health = await call("/health");
      lastStatus = String(health.code);
      if (health.code === 200) return;
    } catch (error) {
      lastStatus = error.code || error.name;
    }
    if (processHandle.exitCode !== null)
      throw new Error("Isolated backend startup failed");
    await delay(300);
  }
  throw new Error("Isolated backend readiness timeout: " + lastStatus);
}
async function stop() {
  if (!processHandle) return;
  const child = processHandle;
  processHandle = null;
  if (child.exitCode !== null) return;
  await new Promise((done) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done();
    }, 10000);
    timer.unref();
    child.once("exit", () => {
      clearTimeout(timer);
      done();
    });
    child.kill();
  });
}
function upload(name, data) {
  const boundary = "semanote" + randomUUID().replaceAll("-", "");
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    Buffer.from(data),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return call(
    "/imports",
    null,
    "POST",
    { "Content-Type": "multipart/form-data; boundary=" + boundary },
    body,
  );
}
try {
  await startDatabase();
  const create = await mysql([
    "--execute=" +
      `CREATE DATABASE ${databaseName} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin; GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,REFERENCES,INDEX,ALTER ON ${databaseName}.* TO 'semanote'@'localhost';`,
  ]);
  check("create isolated database", create.code === 0);
  created = true;
  await start();
  const text = "小林😀在杭州。小林😀在杭州。",
    sentence = "小林😀在杭州。";
  let result = await call("/documents", { title: "HTTP 合成验证", text }),
    document = result.data;
  const path = "/documents/" + document.id;
  check(
    "create and reload exact Unicode text",
    result.code === 201 && (await call(path)).data.revision.textBody === text,
  );
  const words = [
      "小林",
      "😀",
      "在",
      "杭州",
      "。",
      "小林",
      "😀",
      "在",
      "杭州",
      "。",
    ],
    labels = ["PROPN", "SYM", "ADP", "PROPN", "PUNCT"];
  const layers = {
    segmentation: words.map((itemText) => ({ itemText })),
    pos: words.map((_, tokenIndex) => ({
      tokenIndex,
      label: labels[tokenIndex % 5],
    })),
    keywords: [{ itemText: "小林" }, { itemText: "杭州" }],
    ner: ["小林", "杭州"].flatMap((itemText, index) =>
      [0, 1].map((occurrence) => ({
        itemText,
        label: index ? "LOCATION" : "PERSON",
        occurrence,
      })),
    ),
    paragraphs: [{ itemText: text }],
    relations: [0, 1].map((occurrence) => ({
      itemText: sentence,
      label: "位于",
      subject: "小林",
      object: "杭州",
      occurrence,
    })),
    events: [0, 1].map((occurrence) => ({
      itemText: sentence,
      label: "到访",
      roles: { subject: ["小林"], location: ["杭州"] },
      occurrence,
    })),
    sentiment: [0, 1].map((occurrence) => ({
      itemText: sentence,
      label: "NEUTRAL",
      occurrence,
    })),
    intent: [0, 1].map((occurrence) => ({
      itemText: sentence,
      label: "INFORM",
      occurrence,
    })),
    semantic: [0, 1].map((occurrence) => ({
      itemText: sentence,
      label: "EXPLANATION",
      occurrence,
    })),
    errors: [],
  };
  result = await call(path + "/snapshots", {
    rowVersion: document.rowVersion,
    revisionId: document.currentRevisionId,
    layers,
    allowPartial: true,
  });
  document = result.data;
  check(
    "save eleven manual layers through JavaScript validator",
    result.code === 200,
  );
  const snapshotId = document.currentSnapshotId,
    originalRevision = document.currentRevisionId,
    exported = await call(path + "/exports/" + snapshotId);
  check(
    "snapshot statistics/export Unicode and occurrences",
    exported.code === 200 &&
      exported.data.snapshot.statistics.ner.itemCount === 4 &&
      exported.data.snapshot.statistics.keywords.occurrenceCount === 4 &&
      exported.data.snapshot.layers.ner.result.items.find(
        (item) => item.itemText === "杭州",
      ).spans[0].start === 4,
  );
  const invalid = await call(path + "/snapshots", {
    rowVersion: document.rowVersion,
    revisionId: originalRevision,
    layers: { segmentation: [{ itemText: "缺失" }] },
    allowPartial: true,
  });
  check(
    "invalid annotation rejected without changing saved snapshot",
    invalid.code === 400 &&
      (await call(path)).data.currentSnapshotId === snapshotId,
  );
  result = await call(
    path,
    {
      rowVersion: document.rowVersion,
      title: document.title,
      text: text + "结束。",
    },
    "PUT",
  );
  document = result.data;
  check(
    "text revision invalidates only current annotations",
    result.code === 200 &&
      document.currentSnapshotId === null &&
      (await call(path + "/exports/" + snapshotId)).data.snapshot.revision
        .textBody === text,
  );
  check(
    "stale write returns 409",
    (
      await call(
        path,
        { rowVersion: 1, title: "旧页面", text: "新文本" },
        "PUT",
      )
    ).code === 409,
  );
  check(
    "stale annotation revision returns 409",
    (
      await call(path + "/snapshots", {
        rowVersion: document.rowVersion,
        revisionId: originalRevision,
        layers,
        allowPartial: true,
      })
    ).code === 409,
  );
  const imported = await upload(
    "source.csv",
    '\uFEFFA,B,C\r\n" 合成\r\n文本 ",重复,重复\r\n,,独立\r\n',
  );
  check(
    "CSV duplicates blank count and source row/column preserved",
    imported.code === 200 &&
      imported.data.importedCount === 4 &&
      imported.data.skippedCount === 2 &&
      (await call("/documents/" + imported.data.documentIds[0])).data.source
        .rowNumber === 2,
  );
  const count = (await call("/documents")).data.length;
  check(
    "malformed CSV and UTF8 imports are atomic",
    (await upload("bad.csv", "A,B,C\na,b,c\nbroken,row\n")).code === 400 &&
      (await upload("bad.txt", Buffer.from([255]))).code === 400 &&
      (await call("/documents")).data.length === count,
  );
  check(
    "batch/text/file limits reject without truncation",
    (await upload("many.csv", "A,B,C\n" + "a,b,c\n".repeat(167))).code ===
      413 &&
      (await call("/documents", { title: "超限", text: "😀".repeat(10001) }))
        .code === 413 &&
      (await upload("large.txt", Buffer.alloc(5 * 1024 * 1024 + 1, 97)))
        .code === 413,
  );
  const search = await call("/documents", {
    title: "搜索",
    text: "字".repeat(100) + "末尾词",
  });
  check(
    "full text search payload includes content after preview",
    search.data.revision.textBody.endsWith("末尾词") &&
      (await call("/documents")).data.some((item) =>
        item.searchText?.includes("末尾词"),
      ),
  );
  check(
    "cross-site multipart write rejected",
    (
      await call("/documents", { title: "跨站", text: "测试" }, "POST", {
        Origin: "https://example.com",
      })
    ).code === 403,
  );
  check(
    "nonlocal Host cannot read workspace",
    (await call("/documents", null, "GET", { Host: "example.com:8081" }))
      .code === 403,
  );
  const job = {
    requestId: randomUUID(),
    documentId: document.id,
    revisionId: document.currentRevisionId,
    tasks: ["ner"],
    provider: "missing_" + randomUUID().replaceAll("-", "").slice(0, 20),
    remoteConsent: true,
  };
  check(
    "unconfigured supplier rejected before enqueue without remote call",
    (await call("/jobs", job)).code === 400,
  );
  check(
    "remote consent required before enqueue",
    (
      await call("/jobs", {
        ...job,
        requestId: randomUUID(),
        remoteConsent: false,
      })
    ).code === 400,
  );
  const history = (await call("/development/git")).data,
    changes = (await call("/development/git/" + history.head)).data;
  check(
    "structured Git files and bounded first-parent code diff",
    Array.isArray(changes.files) &&
      changes.files.length > 0 &&
      typeof changes.patchTruncated === "boolean" &&
      changes.comparison === "firstParent",
  );
  const fixtureId = randomUUID(),
    sql = `INSERT INTO annotationJob(id,documentId,revisionId,provider,state,requestJson,createdAt,updatedAt) VALUES ('${fixtureId}','${document.id}','${document.currentRevisionId}','fixture','running','{}','2026-10-29T00:00:00Z','2026-10-29T00:00:00Z')`;
  check(
    "synthetic interrupted fixture stored",
    (await mysql([databaseName, "--execute=" + sql])).code === 0,
  );
  await delay(300);
  await stop();
  await mysql([
    databaseName,
    "--execute=UPDATE annotationJob SET state='running' LIMIT 1",
  ]);
  await start();
  check(
    "restart recovers interrupted state without implicit inference",
    (await call("/jobs")).data.some((item) => item.state === "interrupted"),
  );
  await stop();
  const dump = await run(
    resolve(toolRoot, "mysql/bin/mysqldump.exe"),
    [
      "--defaults-file=profile/runtime/mysql-client.cnf",
      "--single-transaction",
      "--no-tablespaces",
      "--set-gtid-purged=OFF",
      databaseName,
    ],
    { check: false },
  );
  check(
    "SQL structure/data backup",
    dump.code === 0 &&
      dump.stdout.includes("CREATE TABLE") &&
      dump.stdout.includes("INSERT INTO"),
  );
  const restoredDb = await mysql([
    "--execute=" + `CREATE DATABASE ${restoreName} CHARACTER SET utf8mb4`,
  ]);
  if (restoredDb.code !== 0)
    throw new Error("Disposable restore database could not be created");
  restoreCreated = true;
  const restored = await mysql([restoreName], dump.stdout),
    countSql =
      "--execute=SELECT COUNT(*) FROM textDocument; SELECT COUNT(*) FROM annotationSnapshot;",
    original = await mysql([
      databaseName,
      "--batch",
      "--skip-column-names",
      countSql,
    ]),
    restoredCounts = await mysql([
      restoreName,
      "--batch",
      "--skip-column-names",
      countSql,
    ]);
  check(
    "SQL restore into a new empty database",
    restored.code === 0 && original.stdout.equals(restoredCounts.stdout),
  );
  await writeJson(resolve(receiptRoot, "http-regression.json"), {
    status: "passed",
    checks,
    remoteCalls: 0,
    scope:
      "Node-only isolated HTTP/JDBC/JavaScript with original synthetic text",
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await stop();
  for (const [name, owned] of [
    [restoreName, restoreCreated],
    [databaseName, created],
  ])
    if (owned && /^semanote_verify_[a-f0-9]{12}(?:_restore)?$/.test(name))
      await mysql(["--execute=DROP DATABASE IF EXISTS " + name]);
}
