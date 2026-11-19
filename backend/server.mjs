import express from "express";
import multer from "multer";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { projectRoot } from "../tools/lib/project.mjs";
import { stopDatabase } from "../tools/local-web.mjs";
import { ApiError, openDatabase } from "./data.mjs";
import { workspaceService, exportText } from "./workspace.mjs";
import { parseImport, maxFileBytes, maxCsvBytes, maxCsvTexts } from "./imports.mjs";
import { modelSettings } from "./settings.mjs";
import { modelLogs } from "./logs.mjs";
import { gitService } from "./git.mjs";
import { jobService } from "./jobs.mjs";
import { taskTypes, entityLabels, posLabels } from "../agent/contract.js";
import { runtimeRoot } from "../agent/provider.js";

const port = Number(process.env.SEMANOTE_PORT || 8080);
const hostname = process.env.SEMANOTE_BIND_ADDRESS || "127.0.0.1";
const managedToken = process.env.SEMANOTE_MANAGED_TOKEN;
const localHosts = ["127.0.0.1", "localhost"];
const privateIpv4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
const lanHosts = (process.env.SEMANOTE_LAN_HOSTS || "").split(",").map((value) => value.trim()).filter(Boolean);
if (lanHosts.some((host) => isIP(host) !== 4 || !privateIpv4.test(host))) throw new Error("Invalid private LAN host configuration");
function originGuard(req, res, next) {
  const authorities = [...localHosts, ...lanHosts].map((host) => host + ":" + req.socket.localPort);
  const origins = authorities.map((authority) => "http://" + authority);
  if (port === 8081) origins.push(...localHosts.map((host) => "http://" + host + ":5173"));
  const writes = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (!authorities.includes(req.headers.host) || (writes && ((req.headers.origin && !origins.includes(req.headers.origin)) || req.headers["sec-fetch-site"] === "cross-site")))
    throw new ApiError(403, "originRejected", "请从已配置的文本工作台地址执行此操作。");
  res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  next();
}

async function start() {
  const database = await openDatabase(process.env);
  try {
    const workspace = workspaceService(database), settings = modelSettings(runtimeRoot), git = gitService(projectRoot);
    const jobs = await jobService(database, settings);
    if (process.env.SEMANOTE_SEED_CORPUS !== "false") {
      const bytes = await readFile(resolve(projectRoot, "profile/data/train.csv")).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      if (bytes) await workspace.seed(await parseImport("train.csv", bytes));
    }
    const app = express(), api = express.Router();
    app.disable("x-powered-by");
    app.set("query parser", "simple");
    app.use(originGuard, express.json({ limit: "8mb" }));
    const imports = new Map();
    const upload = multer({
      defParamCharset: "utf8", limits: { fileSize: maxCsvBytes + 1, files: 1, fields: 2, parts: 4 },
    }).single("file");
    let draining = false, writes = 0, uploadOwner = null;
    const respond = (action, status = 200) => async (req,res) => {
      const writesData = !["GET","HEAD","OPTIONS"].includes(req.method);
      if (writesData) writes++;
      try { res.status(status).json(await action(req)); }
      finally { if (writesData) writes--; }
    };
    api.post("/shutdown", async (req, res) => {
      const command = Boolean(managedToken && req.headers["x-semanote-managed-token"] === managedToken);
      const local = ["127.0.0.1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
      const browser = localHosts.some((host) => req.headers.host === host + ":" + port) &&
        (req.headers.origin === "http://" + req.headers.host ||
          (port === 8081 && localHosts.some((host) => req.headers.origin === "http://" + host + ":5173")));
      if (!managedToken || !local || (!command && !browser)) throw new ApiError(403, "localShutdownOnly", "请在运行服务的电脑上，通过本机地址退出。");
      if (req.body?.confirm !== true) throw new ApiError(400, "shutdownConfirmationRequired", "请确认关闭本地服务。");
      if (draining || writes || uploadOwner || jobs.busy) throw new ApiError(409, "shutdownBusy", "请等待正在进行的导入、保存和标注任务完成后再退出。");
      draining = true;
      const includeDatabase = !command || req.body.database !== false;
      if (includeDatabase) {
        try { await stopDatabase({ backendDrained: true }); }
        catch { draining = false; throw new ApiError(503, "shutdownFailed", "数据库未能安全关闭，请检查本机服务状态。"); }
      }
      res.on("finish", () => {
        server.close(() => void database.close());
      });
      res.json({ status: "stopped", database: includeDatabase });
    });
    api.use((req,res,next) => {
      if (draining) throw new ApiError(503, "shuttingDown", "服务正在关闭。");
      next();
    });
    api.get("/health", respond(() => ({ status: "ready", contractVersion: "1.0.0", runtime: "node" })));
    api.get("/meta", respond(() => ({
      tasks: taskTypes, entityLabels, posLabels, maxTextLength: 10000, maxBatchSize: 500,
      maxFileBytes, maxCsvBytes, maxCsvTexts, offsetUnit: "unicodeCodePoint",
    })));
    api.get("/documents", respond(() => workspace.documents()));
    api.post("/documents", respond((req) => workspace.create(req.body), 201));
    api.get("/documents/:id", respond(({ params }) => workspace.document(params.id)));
    api.put("/documents/:id", respond(({ params, body }) => workspace.update(params.id, body)));
    api.post("/documents/:id/archive", respond(({ params, body }) => workspace.archive(params.id, body)));
    api.get("/documents/:id/revisions", respond(({ params }) => workspace.history(params.id)));
    api.post("/imports", (req, res, next) => {
      if (uploadOwner) return next(new ApiError(409, "importBusy", "另一份文件正在导入，请稍后重试。"));
      uploadOwner = req;
      const aborted = () => { if (uploadOwner === req) uploadOwner = null; };
      req.once("aborted", aborted);
      upload(req, res, (error) => {
        req.off("aborted", aborted);
        if (error) aborted();
        next(error);
      });
    }, respond(async (req) => {
      const { file, body } = req;
      try {
        if (!file) throw new ApiError(400, "missingFile", "请选择要导入的文件。");
        const requestId = body.requestId ?? "";
        if (requestId && !/^[A-Za-z0-9_-]{1,36}$/.test(requestId)) throw new ApiError(400, "invalidRequestId", "导入请求身份不正确。");
        const parsed = await parseImport(file.originalname, file.buffer);
        const limit = body.limit === undefined ? null : Number(body.limit);
        if (limit !== null && (!/\.csv$/i.test(parsed.fileName) || !Number.isInteger(limit) || limit < 1 || limit > parsed.texts.length))
          throw new ApiError(400, "invalidImportLimit", "导入数量必须在该 CSV 的有效文本范围内。");
        const update = (completed, total) => { if (requestId) imports.set(requestId, { completed, total }); };
        update(0, limit ?? parsed.texts.length);
        try { return await workspace.importFile(parsed, limit, update); }
        finally { if (requestId) imports.delete(requestId); }
      } finally { if (uploadOwner === req) uploadOwner = null; }
    }));
    api.get("/imports/:id", respond(({ params }) => imports.get(params.id) || null));
    api.get("/jobs", respond(() => jobs.list()));
    api.get("/jobs/:id", respond(({ params }) => jobs.job(params.id)));
    api.post("/jobs", respond(({ body }) => jobs.start(body), 202));
    api.post("/jobs/:id/retry", respond(({ params, body }) => jobs.retry(params.id, body), 202));
    api.get("/documents/:id/snapshots/:snapshotId", respond(({ params }) => workspace.snapshot(params.id, params.snapshotId)));
    api.post("/documents/:id/snapshots", respond(({ params, body }) => workspace.saveSnapshot(params.id, body)));
    api.get("/documents/:id/exports/:snapshotId", async ({ params, query }, res) => {
      const format = query.format ?? "json";
      if (!["json","txt","md"].includes(format)) throw new ApiError(400, "invalidExportFormat", "请选择 JSON、TXT 或 Markdown。");
      const data = await workspace.exportSnapshot(params.id, params.snapshotId);
      res.attachment("semanote-" + data.snapshot.id + "." + format);
      if (format === "json") res.json(data);
      else res.type("text/plain").send(exportText(data));
    });
    api.get("/statistics", respond(() => workspace.statistics()));
    api.get("/development/git", respond(() => git.history()));
    api.get("/development/git/:id", respond(({ params }) => git.changes(params.id)));
    api.get("/settings/model", respond(() => settings.read()));
    api.put("/settings/model", respond(({ body }) => settings.save(body)));
    api.get("/model-logs", respond(({ query }) => modelLogsList(query)));
    const modelLogsList = modelLogs(runtimeRoot);
    api.use(() => { throw new ApiError(404, "notFound", "所选内容不存在，请刷新列表。"); });
    app.use("/api/v1", api);
    const dist = resolve(projectRoot, "frontend/dist");
    app.get(["/", "/developer"], (req, res) => res.set("Cache-Control", "no-cache").sendFile(resolve(dist, "index.html")));
    app.use(express.static(dist, { maxAge: 0 }));
    app.use((error, req, res, next) => {
      if (res.headersSent) return next(error);
      const tooLarge = error.type === "entity.too.large" || error.code === "LIMIT_FILE_SIZE";
      const invalid = error instanceof multer.MulterError || error.status === 400 || /^[a-z][A-Za-z]+$/.test(error.code || "");
      const failure = error instanceof ApiError ? error : tooLarge ? new ApiError(413, "fileTooLarge", "请求超出容量限制。")
        : invalid ? new ApiError(400, "invalidRequest", "请求格式或标注内容无效。")
        : new ApiError(500, "internalError", "服务未能完成操作，请重试。");
      if (failure.status === 500) console.error("请求未完成。", error.code || error.name);
      res.status(failure.status).json({ error: { code: failure.code, message: failure.message } });
    });
    const server = await new Promise((resolve, reject) => {
      const listener = app.listen(port, hostname, () => resolve(listener));
      listener.once("error", reject);
    });
    console.log("Semanote web ready");
  } catch (error) {
    await database.close();
    throw error;
  }
}
start().catch((error) => { console.error("Semanote 启动失败。", error.code || error.name); process.exitCode = 1; });
