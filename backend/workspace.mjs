import { createHash, randomUUID } from "node:crypto";
import { ApiError, now, one, parseStored } from "./data.mjs";
import { validateText } from "./imports.mjs";
import { manual } from "../agent/agent.js";
import { taskTypes, validateResponse, hash } from "../agent/contract.js";

export function requiredText(body, field) {
  if (typeof body?.[field] !== "string") throw new ApiError(400, "invalidField", "缺少有效字段：" + field);
  return body[field];
}
function expectedVersion(body) {
  if (!Number.isSafeInteger(body?.rowVersion)) throw new ApiError(400, "invalidVersion", "缺少当前保存版本，请重新载入。");
  return body.rowVersion;
}
function title(body) {
  const value = requiredText(body, "title").trim();
  if (!value || value.length > 200 || !value.isWellFormed()) throw new ApiError(400, "invalidTitle", "标题需为 1–200 个字符。");
  return value;
}
function conflict() { throw new ApiError(409, "versionConflict", "内容已在其他页面改变；请重新载入并合并本地修改。"); }
function requireCurrent(document, version) {
  if (document.rowVersion !== version) conflict();
  if (document.archived) throw new ApiError(409, "archived", "请先恢复已归档文本。");
}
function documentRow(row) {
  const { sourceJson, ...document } = row;
  return { ...document, rowVersion: Number(document.rowVersion), archived: Boolean(document.archived), source: parseStored(sourceJson) };
}
const insertDocuments = "INSERT INTO textDocument(id,title,currentRevisionId,sourceJson,createdAt,updatedAt) VALUES";
const insertRevisions = "INSERT INTO textRevision(id,documentId,revisionNumber,textBody,textHash,createdAt) VALUES";
function documentPair(name, text, source, id = randomUUID(), revisionId = randomUUID()) {
  const time = now();
  return [[id, name, revisionId, JSON.stringify(source), time, time], [revisionId, id, 1, text, hash(text), time]];
}
async function insertPairs(query, pairs) {
  if (!pairs.length) return;
  const placeholders = pairs.map(() => "(?,?,?,?,?,?)").join(",");
  await query(insertDocuments + " " + placeholders, ...pairs.flatMap(([document]) => document));
  await query(insertRevisions + " " + placeholders, ...pairs.flatMap(([,revision]) => revision));
}
// Existing seed IDs used a name-based MD5 UUID. Preserve them to avoid reimporting existing data.
function seedId(value) {
  const bytes = createHash("md5").update(value).digest();
  bytes[6] = (bytes[6] & 15) | 48;
  bytes[8] = (bytes[8] & 63) | 128;
  return bytes.toString("hex").replace(/^(........)(....)(....)(....)/, "$1-$2-$3-$4-");
}
function add(counts, key, amount = 1) { counts[key] = (counts[key] || 0) + amount; }
function layerStatistics(layers) {
  return Object.fromEntries(taskTypes.map((task) => {
    const layer = layers[task], status = layer?.status || "notRequested";
    if (status !== "success") return [task, { status, itemCount: null, occurrenceCount: null }];
    const items = layer.result.items, labels = Object.create(null);
    let occurrenceCount = 0;
    for (const item of items) {
      occurrenceCount += item.spans.length;
      if (item.label != null) add(labels, item.label);
    }
    const keywords = task === "keywords" ? { keywords: items.map(({ itemText, spans }) => ({ itemText, count: spans.length })) } : {};
    return [task, { status, itemCount: items.length, occurrenceCount, labels, ...keywords }];
  }));
}

export function workspaceService({ query, transaction }) {
  async function snapshot(id, snapshotId, read = query) {
    const { layersJson, ...row } = await one(read, "SELECT * FROM annotationSnapshot WHERE id=? AND documentId=?", snapshotId, id);
    const layers = parseStored(layersJson);
    return { ...row, layers, statistics: layerStatistics(layers), revision: await one(read, "SELECT * FROM textRevision WHERE id=? AND documentId=?", row.revisionId, id) };
  }
  async function document(id, read = query) {
    const row = documentRow(await one(read, "SELECT * FROM textDocument WHERE id=?", id));
    const [revision, saved] = await Promise.all([
      one(read, "SELECT * FROM textRevision WHERE id=?", row.currentRevisionId),
      row.currentSnapshotId && snapshot(id, row.currentSnapshotId, read),
    ]);
    return { ...row, revision, snapshot: saved };
  }
  async function exportSnapshot(id, snapshotId) {
    const [saved, row] = await Promise.all([snapshot(id, snapshotId), one(query, "SELECT title,sourceJson FROM textDocument WHERE id=?", id)]);
    return { exportVersion: "1.0.0", exportedAt: now(), offsetUnit: "unicodeCodePoint", document: { id, title: row.title, source: parseStored(row.sourceJson) }, snapshot: saved };
  }
  return {
    document, snapshot, exportSnapshot,
    async documents() {
      const rows = await query("SELECT d.*,r.revisionNumber,r.textBody,r.textHash FROM textDocument d JOIN textRevision r ON r.id=d.currentRevisionId ORDER BY d.updatedAt DESC,d.id");
      return rows.map(({ textBody, ...row }) => {
        const result = documentRow(row);
        if (result.source) delete result.source.occurrences;
        let textLength = 0, preview = "";
        for (const character of textBody) {
          if (textLength < 90) preview += character;
          textLength++;
        }
        return { ...result, searchText: textBody, textLength, preview };
      });
    },
    async create(body) {
      const text = requiredText(body, "text"), name = title(body);
      validateText(text);
      const pair = documentPair(name, text, { kind: "manual" });
      await transaction((write) => insertPairs(write, [pair]));
      return document(pair[0][0]);
    },
    async update(id, body) {
      const text = requiredText(body, "text"), name = title(body), version = expectedVersion(body);
      validateText(text);
      await transaction(async (write) => {
        const current = await one(write, "SELECT d.rowVersion,d.archived,d.currentRevisionId,d.currentSnapshotId,r.revisionNumber,r.textBody FROM textDocument d JOIN textRevision r ON r.id=d.currentRevisionId WHERE d.id=?", id);
        requireCurrent({ ...current, rowVersion: Number(current.rowVersion) }, version);
        const changed = current.textBody !== text, revisionId = changed ? randomUUID() : current.currentRevisionId;
        const result = await write("UPDATE textDocument SET title=?,currentRevisionId=?,currentSnapshotId=?,rowVersion=rowVersion+1,updatedAt=? WHERE id=? AND rowVersion=? AND archived=FALSE",
          name, revisionId, changed ? null : current.currentSnapshotId, now(), id, version);
        if (result.affectedRows !== 1) conflict();
        if (changed) await write(insertRevisions + " (?,?,?,?,?,?)", revisionId, id, current.revisionNumber + 1, text, hash(text), now());
      });
      return document(id);
    },
    async archive(id, body) {
      if (typeof body?.archived !== "boolean") throw new ApiError(400, "invalidArchive", "请明确归档或恢复。");
      const result = await query("UPDATE textDocument SET archived=?,rowVersion=rowVersion+1,updatedAt=? WHERE id=? AND rowVersion=?", body.archived, now(), id, expectedVersion(body));
      if (!result.affectedRows) { await one(query, "SELECT id FROM textDocument WHERE id=?", id); conflict(); }
      return document(id);
    },
    async history(id) {
      await one(query, "SELECT id FROM textDocument WHERE id=?", id);
      const [revisions, snapshots] = await Promise.all([
        query("SELECT * FROM textRevision WHERE documentId=? ORDER BY revisionNumber DESC", id),
        query("SELECT id,revisionId,producerKind,baseSnapshotId,jobId,createdAt FROM annotationSnapshot WHERE documentId=? ORDER BY createdAt DESC,id", id),
      ]);
      return { revisions, snapshots };
    },
    async importFile({ fileName, texts, skippedCount }, limit, progress) {
      const selected = limit === null ? texts : texts.slice(0, limit);
      const summary = { batchId: randomUUID(), importedCount: selected.length, skippedCount };
      const documentIds = await transaction(async (write) => {
        await write("INSERT INTO importBatch(id,fileName,summaryJson,createdAt) VALUES (?,?,?,?)", summary.batchId, fileName, JSON.stringify(summary), now());
        const ids = [];
        for (let offset = 0; offset < selected.length; offset += 100) {
          const pairs = selected.slice(offset, offset + 100).map(({ text, ...source }) => documentPair(
            Array.from(fileName + " · " + source.rowNumber + ":" + source.columnNumber).slice(0, 200).join(""), text,
            { kind: "import", batchId: summary.batchId, fileName, ...source },
          ));
          await insertPairs(write, pairs);
          ids.push(...pairs.map(([row]) => row[0]));
          progress(ids.length, selected.length);
        }
        return ids;
      });
      return { ...summary, documentIds };
    },
    async seed(parsed) {
      const groups = new Map();
      for (const { text, ...source } of parsed.texts) {
        if (!groups.has(text)) groups.set(text, []);
        groups.get(text).push(source);
      }
      const pairs = Array.from(groups, ([text, occurrences], index) => {
        const id = seedId("semanote-corpus:" + text);
        return documentPair("语料 · " + String(index + 1).padStart(4, "0"), text, {
          kind: "corpus", fileName: parsed.fileName, sourceCount: occurrences.length, occurrences,
        }, id, seedId(id + ":1"));
      });
      await transaction(async (write) => {
        for (let offset = 0; offset < pairs.length; offset += 100) {
          const block = pairs.slice(offset, offset + 100);
          const existing = new Set((await write("SELECT id FROM textDocument WHERE id IN (" + block.map(() => "?").join(",") + ")", ...block.map(([row]) => row[0]))).map(({ id }) => id));
          await insertPairs(write, block.filter(([row]) => !existing.has(row[0])));
        }
      });
    },
    async saveSnapshot(id, body) {
      const version = expectedVersion(body), current = await document(id);
      requireCurrent(current, version);
      const revisionId = requiredText(body, "revisionId");
      if (revisionId !== current.currentRevisionId) throw new ApiError(409, "staleRevision", "文本已改变；旧标注只可在历史修订查看。");
      let layers, jobId = null, baseSnapshotId = null;
      const automatic = typeof body.candidateId === "string";
      const readJob = (job) => one(query, "SELECT * FROM annotationJob WHERE id=? AND documentId=? AND revisionId=?", job, id, revisionId);
      if (automatic) {
        if (Object.hasOwn(body, "layers")) throw new ApiError(400, "ambiguousSnapshot", "一次只能保存自动候选或人工结果。");
        const job = await readJob(body.candidateId), response = parseStored(job.responseJson);
        if (!["success", "partialFailure"].includes(job.state) || !response?.layers)
          throw new ApiError(409, "candidateUnavailable", "候选还没有可保存的结果。");
        layers = validateResponse(parseStored(job.requestJson), response).layers;
        jobId = job.id;
      } else {
        if (!body.layers || Array.isArray(body.layers) || typeof body.layers !== "object") throw new ApiError(400, "invalidLayers", "请选择需要保存的标注层。");
        layers = manual({ text: current.revision.textBody, revisionId, layers: body.layers }).layers;
        if (typeof body.candidateJobId === "string") jobId = (await readJob(body.candidateJobId)).id;
        if (typeof body.baseSnapshotId === "string") baseSnapshotId = (await one(query, "SELECT id FROM annotationSnapshot WHERE id=? AND documentId=? AND revisionId=?", body.baseSnapshotId, id, revisionId)).id;
      }
      const successful = Object.values(layers).filter(({ status }) => status === "success").length;
      if (!successful) throw new ApiError(400, "emptySnapshot", "至少需要一个有效标注层。");
      if (successful < taskTypes.length && body.allowPartial !== true) throw new ApiError(409, "partialConfirmationRequired", "请明确选择保存部分结果。");
      const snapshotId = randomUUID();
      await transaction(async (write) => {
        const result = await write("UPDATE textDocument SET currentSnapshotId=?,rowVersion=rowVersion+1,updatedAt=? WHERE id=? AND rowVersion=? AND currentRevisionId=? AND archived=FALSE", snapshotId, now(), id, version, revisionId);
        if (result.affectedRows !== 1) conflict();
        await write("INSERT INTO annotationSnapshot(id,documentId,revisionId,producerKind,baseSnapshotId,jobId,layersJson,createdAt) VALUES (?,?,?,?,?,?,?,?)",
          snapshotId, id, revisionId, automatic ? "automatic" : "manual", baseSnapshotId, jobId, JSON.stringify(layers), now());
      });
      return document(id);
    },
    async statistics() {
      const rows = await query("SELECT s.layersJson FROM textDocument d LEFT JOIN annotationSnapshot s ON s.id=d.currentSnapshotId AND s.revisionId=d.currentRevisionId WHERE d.archived=FALSE");
      const itemCounts = Object.fromEntries(taskTypes.map((task) => [task, 0])), coverage = { ...itemCounts };
      const keywords = Object.create(null), entityLabels = Object.create(null), posLabels = Object.create(null);
      let savedCount = 0;
      for (const { layersJson } of rows) {
        const layers = parseStored(layersJson);
        if (!layers) continue;
        savedCount++;
        for (const task of taskTypes) {
          if (layers[task]?.status !== "success") continue;
          coverage[task]++;
          const { items } = layers[task].result;
          itemCounts[task] += items.length;
          for (const item of items) {
            if (task === "ner") add(entityLabels, item.label);
            if (task === "pos") add(posLabels, item.label);
            if (task === "keywords") add(keywords, item.itemText, item.spans.length);
          }
        }
      }
      return { documentCount: rows.length, savedCount, itemCounts, coverage, entityLabels, posLabels,
        keywords: Object.entries(keywords).sort(([a,x], [b,y]) => y - x || (a < b ? -1 : +(a > b))).slice(0, 20).map(([itemText,count]) => ({ itemText,count })),
      };
    },
  };
}
export function exportText(data) {
  const lines = ["# " + data.document.title, "", data.snapshot.revision.textBody, ""];
  for (const task of taskTypes) {
    const layer = data.snapshot.layers[task];
    lines.push("## " + task + " · " + (layer?.status || ""));
    for (const item of layer?.result?.items || []) {
      lines.push("- " + item.itemText + " " + (item.label || "") + " " + JSON.stringify(item.spans));
      if (item.subject) lines.push("  主体：" + item.subject.itemText + "；客体：" + item.object.itemText);
      for (const [role, entries] of Object.entries(item.roles || {})) lines.push("  " + role + ": " + entries.map((entry) => entry.itemText + "；").join(""));
      if (item.suggestion != null) lines.push("  建议：" + item.suggestion + "；原因：" + item.explanation);
    }
    lines.push("");
  }
  return lines.join("\n") + "\n";
}
