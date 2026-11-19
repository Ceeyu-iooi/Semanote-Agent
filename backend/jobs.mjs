import { ApiError, now, one, parseStored } from "./data.mjs";
import { requiredText } from "./workspace.mjs";
import { annotate } from "../agent/agent.js";
import { taskTypes } from "../agent/contract.js";
import { isDeepStrictEqual } from "node:util";

export async function jobService({ query }, settings) {
  const progress = new Map(), queue = [];
  let running, submissions = Promise.resolve();
  await query("UPDATE annotationJob SET state='interrupted',errorMessage=?,updatedAt=? WHERE state IN ('queued','running')",
    "服务曾中断，未形成完整回执；请先核对供应商记录，再决定是否重试。", now());
  async function job(id) {
    const { requestJson, responseJson, ...row } = await one(query, "SELECT * FROM annotationJob WHERE id=?", id);
    return { ...row, request: parseStored(requestJson), response: parseStored(responseJson), progress: progress.get(id) || null };
  }
  async function execute({ id, request, previousResponse, config }) {
    try {
      await query("UPDATE annotationJob SET state='running',updatedAt=? WHERE id=?", now(), id);
      const response = await annotate(request, config, {
        previousResponse,
        onProgress(event) {
          const checkpoint = { layers: {}, ...progress.get(id) };
          for (const field of ["taskType", "status", "completedChunks", "totalChunks", "phase", "networkCalls", "localCacheHits"])
            if (Object.hasOwn(event, field)) checkpoint[field] = event[field];
          if (["success", "failed"].includes(event.status)) checkpoint.layers[event.taskType] = event.layer;
          progress.set(id, checkpoint);
        },
      });
      await query("UPDATE annotationJob SET state=?,responseJson=?,updatedAt=? WHERE id=?", response.status, JSON.stringify(response), now(), id);
    } catch {
      await query("UPDATE annotationJob SET state='failed',errorMessage=?,updatedAt=? WHERE id=?", "调用未完成，未自动重发。", now(), id);
    } finally { progress.delete(id); }
  }
  function drain() {
    if (running || !queue.length) return;
    running = execute(queue.shift()).catch(() => console.error("无法持久化任务状态。")).finally(() => {
      running = null;
      drain();
    });
  }
  function serialize(action) {
    const result = submissions.then(action);
    submissions = result.catch(() => {});
    return result;
  }
  async function enqueue(id, documentId, revisionId, provider, request, previousId = null, previousResponse = null) {
    if (queue.length >= 500) throw new ApiError(503, "queueFull", "队列已满，请等待当前任务完成。");
    const config = request.tasks.some((task) => task !== "paragraphs") ? await settings.executionConfig(provider) : { id: provider };
    const time = now();
    await query("INSERT INTO annotationJob(id,documentId,revisionId,previousJobId,provider,state,requestJson,createdAt,updatedAt) VALUES (?,?,?,?,?,'queued',?,?,?)",
      id, documentId, revisionId, previousId, provider, JSON.stringify(request), time, time);
    queue.push({ id, request, previousResponse, config });
    drain();
    return job(id);
  }
  function consent(body) {
    if (body?.remoteConsent !== true) throw new ApiError(400, "remoteConsentRequired", "自动标注会发送文本到所选模型；请先确认有权发送。");
    const id = requiredText(body, "requestId");
    if (!/^[A-Za-z0-9_-]{1,36}$/.test(id)) throw new ApiError(400, "invalidRequestId", "请求身份格式不正确。");
    return id;
  }
  async function current(id, revisionId) {
    const row = await one(query, "SELECT d.currentRevisionId,d.archived,r.textBody FROM textDocument d JOIN textRevision r ON r.id=d.currentRevisionId WHERE d.id=?", id);
    if (row.currentRevisionId !== revisionId || row.archived) throw new ApiError(409, "staleRevision", "请选择未归档文本的当前修订。");
    return row;
  }
  return {
    job,
    list: () => query("SELECT j.id,j.documentId,j.revisionId,j.previousJobId,j.provider,j.state,j.errorMessage,j.createdAt,j.updatedAt,d.title FROM annotationJob j JOIN textDocument d ON d.id=j.documentId ORDER BY j.createdAt DESC,j.id"),
    get busy() { return Boolean(running || queue.length); },
    start: (body) => serialize(async () => {
      const id = consent(body), documentId = requiredText(body, "documentId"), revisionId = requiredText(body, "revisionId");
      const { tasks, provider = "deepseek" } = body;
      if (typeof provider !== "string" || !/^[a-z][a-z0-9_]{0,39}$/.test(provider)) throw new ApiError(400, "invalidProvider", "供应商名称不正确。");
      if (!Array.isArray(tasks) || !tasks.length || tasks.some((task) => !taskTypes.includes(task)) || new Set(tasks).size !== tasks.length)
        throw new ApiError(400, "invalidTasks", "任务类型不正确或重复。");
      const [old] = await query("SELECT documentId,revisionId,provider,requestJson FROM annotationJob WHERE id=?", id);
      if (old) {
        if (old.documentId !== documentId || old.revisionId !== revisionId || old.provider !== provider || !isDeepStrictEqual(parseStored(old.requestJson).tasks, tasks))
          throw new ApiError(409, "requestIdConflict", "同一请求身份不能用于不同输入。");
        return job(id);
      }
      const { textBody } = await current(documentId, revisionId);
      return enqueue(id, documentId, revisionId, provider, { requestId: id, revisionId, text: textBody, tasks });
    }),
    retry: (previousId, body) => serialize(async () => {
      const id = consent(body), previous = await job(previousId);
      const [old] = await query("SELECT previousJobId FROM annotationJob WHERE id=?", id);
      if (old) {
        if (old.previousJobId !== previousId) throw new ApiError(409, "requestIdConflict", "重试身份已经用于其他任务。");
        return job(id);
      }
      if (!["failed", "partialFailure", "interrupted"].includes(previous.state)) throw new ApiError(409, "notRetryable", "该任务无需重试，或仍在处理中。");
      await current(previous.documentId, previous.revisionId);
      return enqueue(id, previous.documentId, previous.revisionId, previous.provider, previous.request, previousId, previous.response);
    }),
  };
}
