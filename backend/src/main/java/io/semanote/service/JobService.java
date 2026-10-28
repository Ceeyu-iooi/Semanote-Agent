package io.semanote.service;

import com.fasterxml.jackson.databind.JsonNode;
import io.semanote.agent.AgentBridge;
import io.semanote.api.ApiFailure;
import io.semanote.data.WorkspaceRepository;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ConcurrentHashMap;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

/** Durable per-text jobs; no implicit model retries, even after server restart. */
@Service
@org.springframework.boot.sql.init.dependency.DependsOnDatabaseInitialization
public class JobService {
    private final WorkspaceRepository repository;
    private final WorkspaceService workspace;
    private final AgentBridge bridge;
    private final ModelSettingsService modelSettings;
    private final Map<String, JsonNode> progress = new ConcurrentHashMap<>();
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(500));

    public JobService(WorkspaceRepository repository, WorkspaceService workspace, AgentBridge bridge, ModelSettingsService modelSettings) {
        this.repository = repository; this.workspace = workspace; this.bridge = bridge; this.modelSettings=modelSettings;
    }

    @PostConstruct
    public void recoverInterrupted() {
        repository.jdbc().update("UPDATE annotationJob SET state='interrupted',errorMessage=?,updatedAt=? WHERE state IN ('queued','running')", "服务曾中断，未形成完整回执；显式重试可能重新调用全部层，请先核对供应商记录。", WorkspaceService.now());
    }

    @PreDestroy
    public void stop() { executor.shutdownNow(); }

    public List<Map<String, Object>> list() {
        return repository.jdbc().queryForList("SELECT j.id,j.documentId,j.revisionId,j.previousJobId,j.provider,j.state,j.errorMessage,j.createdAt,j.updatedAt,d.title FROM annotationJob j JOIN textDocument d ON d.id=j.documentId ORDER BY j.createdAt DESC,j.id");
    }

    public Map<String, Object> job(String jobId) {
        Map<String, Object> job = repository.one("SELECT * FROM annotationJob WHERE id=?", jobId);
        job.put("request", repository.parse(job.remove("requestJson")));
        job.put("response", repository.parse(job.remove("responseJson")));
        job.put("progress", progress.get(jobId));
        return job;
    }

    public synchronized Map<String, Object> start(JsonNode body) {
        requireConsent(body);
        String documentId = WorkspaceService.requiredText(body, "documentId"), revisionId = WorkspaceService.requiredText(body, "revisionId");
        String jobId = WorkspaceService.requiredText(body, "requestId");
        if (!jobId.matches("[A-Za-z0-9_-]{1,100}")) throw new ApiFailure(400, "invalidRequestId", "请求身份格式不正确。");
        // Storage uses UUID-sized IDs; browser request IDs are UUIDs.
        if (jobId.length() > 36) throw new ApiFailure(400, "invalidRequestId", "请求身份不能超过 36 个字符。");
        String provider = body.path("provider").asText("deepseek");
        if (!provider.matches("[a-z][a-z0-9_]{0,39}")) throw new ApiFailure(400, "invalidProvider", "供应商名称不正确。");
        JsonNode tasks = body.path("tasks");
        if (!tasks.isArray() || tasks.isEmpty() || tasks.size() > 4) throw new ApiFailure(400, "invalidTasks", "请选择至少一项标注任务。");
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (JsonNode task : tasks) if (!task.isTextual() || !List.of("segmentation", "keywords", "pos", "ner").contains(task.asText()) || !seen.add(task.asText())) throw new ApiFailure(400, "invalidTasks", "任务类型不正确或重复。");
        List<Map<String, Object>> existing = repository.jdbc().queryForList("SELECT id,documentId,revisionId,provider,requestJson FROM annotationJob WHERE id=?", jobId);
        if (!existing.isEmpty()) {
            Map<String, Object> old = existing.getFirst();
            if (!documentId.equals(old.get("documentId")) || !revisionId.equals(old.get("revisionId")) || !provider.equals(old.get("provider")) || !tasks.equals(repository.parse(old.get("requestJson")).path("tasks"))) throw new ApiFailure(409, "requestIdConflict", "同一请求身份不能用于不同输入。");
            return job(jobId);
        }
        Map<String, Object> document = workspace.document(documentId);
        if (!revisionId.equals(document.get("currentRevisionId")) || Boolean.TRUE.equals(document.get("archived"))) throw new ApiFailure(409, "staleRevision", "请选择未归档文本的当前修订。");
        JsonNode revision = repository.parse(repository.json(document.get("revision")));
        Map<String, Object> request = Map.of("requestId", jobId, "revisionId", revisionId, "text", revision.path("textBody").asText(), "tasks", tasks);
        return enqueue(jobId, documentId, revisionId, provider, request, null, null);
    }

    public synchronized Map<String, Object> retry(String previousId, JsonNode body) {
        requireConsent(body);
        Map<String, Object> previous = job(previousId);
        if (!List.of("failed", "partialFailure", "interrupted").contains(previous.get("state"))) throw new ApiFailure(409, "notRetryable", "该任务无需重试，或仍在处理中。");
        Map<String, Object> document = workspace.document(previous.get("documentId").toString());
        if (!previous.get("revisionId").equals(document.get("currentRevisionId")) || Boolean.TRUE.equals(document.get("archived"))) throw new ApiFailure(409, "staleRevision", "旧修订任务保留历史，请为当前文本发起新标注。");
        String retryId = WorkspaceService.requiredText(body, "requestId");
        if (!retryId.matches("[A-Za-z0-9_-]{1,36}")) throw new ApiFailure(400, "invalidRequestId", "重试请求身份格式不正确。");
        List<Map<String, Object>> existing = repository.jdbc().queryForList("SELECT previousJobId FROM annotationJob WHERE id=?", retryId);
        if (!existing.isEmpty()) {
            if (!previousId.equals(existing.getFirst().get("previousJobId"))) throw new ApiFailure(409, "requestIdConflict", "重试身份已经用于其他任务。");
            return job(retryId);
        }
        return enqueue(retryId, previous.get("documentId").toString(), previous.get("revisionId").toString(), previous.get("provider").toString(), previous.get("request"), previousId, (JsonNode) previous.get("response"));
    }

    private static void requireConsent(JsonNode body) {
        if (!body.path("remoteConsent").isBoolean() || !body.path("remoteConsent").asBoolean()) throw new ApiFailure(400, "remoteConsentRequired", "自动标注会发送文本到所选模型；请先确认有权发送。");
    }

    private Map<String, Object> enqueue(String id, String documentId, String revisionId, String provider, Object request, String previousId, JsonNode previousResponse) {
        if (executor.getQueue().remainingCapacity() == 0) throw new ApiFailure(503, "queueFull", "队列已满，请等待当前任务完成。");
        String timestamp = WorkspaceService.now();
        repository.jdbc().update("INSERT INTO annotationJob(id,documentId,revisionId,previousJobId,provider,state,requestJson,createdAt,updatedAt) VALUES (?,?,?,?,?,'queued',?,?,?)", id, documentId, revisionId, previousId, provider, repository.json(request), timestamp, timestamp);
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("action", "annotate"); envelope.put("remoteConsent", true); envelope.put("streamProgress", true); envelope.put("request", request); envelope.put("provider", provider);
        envelope.put("modelPreferences", modelSettings.read());
        if (previousResponse != null && !previousResponse.isNull()) envelope.put("previousResponse", previousResponse);
        executor.execute(() -> execute(id, envelope));
        return job(id);
    }

    private void execute(String jobId, Map<String, Object> envelope) {
        repository.jdbc().update("UPDATE annotationJob SET state='running',updatedAt=? WHERE id=?", WorkspaceService.now(), jobId);
        try {
            JsonNode response = bridge.invoke(envelope, true, event -> {
                ObjectNode checkpoint = (ObjectNode) repository.parse("{}");
                JsonNode previous = progress.get(jobId);
                ObjectNode layers = previous == null ? (ObjectNode) repository.parse("{}") : (ObjectNode) previous.path("layers").deepCopy();
                if (event.path("status").asText().equals("success")) layers.set(event.path("taskType").asText(), event.path("layer"));
                checkpoint.put("taskType", event.path("taskType").asText()); checkpoint.put("status", event.path("status").asText());
                checkpoint.set("layers", layers); progress.put(jobId, checkpoint);
            });
            repository.jdbc().update("UPDATE annotationJob SET state=?,responseJson=?,updatedAt=? WHERE id=?", response.path("status").asText("failed"), repository.json(response), WorkspaceService.now(), jobId);
        } catch (ApiFailure failure) {
            repository.jdbc().update("UPDATE annotationJob SET state='failed',errorMessage=?,updatedAt=? WHERE id=?", failure.getMessage(), WorkspaceService.now(), jobId);
        } catch (Exception exception) {
            repository.jdbc().update("UPDATE annotationJob SET state='failed',errorMessage=?,updatedAt=? WHERE id=?", "调用未完成，未自动重发。", WorkspaceService.now(), jobId);
        } finally { progress.remove(jobId); }
    }
}
