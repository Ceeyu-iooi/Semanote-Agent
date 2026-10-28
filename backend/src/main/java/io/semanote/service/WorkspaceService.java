package io.semanote.service;

import com.fasterxml.jackson.databind.JsonNode;
import io.semanote.agent.AgentBridge;
import io.semanote.api.ApiFailure;
import io.semanote.data.WorkspaceRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Immutable revisions/snapshots, optimistic publication, and snapshot-derived statistics. */
@Service
public class WorkspaceService {
    private final WorkspaceRepository repository;
    private final AgentBridge bridge;
    private final TransactionTemplate transaction;

    public WorkspaceService(WorkspaceRepository repository, AgentBridge bridge, PlatformTransactionManager manager) {
        this.repository = repository; this.bridge = bridge; this.transaction = new TransactionTemplate(manager);
    }

    public static String identity() { return UUID.randomUUID().toString(); }
    public static String now() { return Instant.now().toString(); }
    public static String requiredText(JsonNode body, String field) {
        if (!body.path(field).isTextual()) throw new ApiFailure(400, "invalidField", "缺少有效字段：" + field);
        return body.path(field).asText();
    }
    public static long expectedVersion(JsonNode body) {
        if (!body.path("rowVersion").isIntegralNumber() || !body.path("rowVersion").canConvertToLong()) throw new ApiFailure(400, "invalidVersion", "缺少当前保存版本，请重新载入。");
        return body.path("rowVersion").asLong();
    }
    private String title(JsonNode body) {
        String value = requiredText(body, "title").strip();
        if (value.isEmpty() || value.length() > 200) throw new ApiFailure(400, "invalidTitle", "标题需为 1–200 个字符。");
        return value;
    }
    private static String fingerprint(String text) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception exception) { throw new IllegalStateException(exception); }
    }

    public List<Map<String, Object>> documents() {
        List<Map<String, Object>> rows = repository.jdbc().queryForList("SELECT d.*, r.revisionNumber, r.textBody, r.textHash FROM textDocument d JOIN textRevision r ON r.id=d.currentRevisionId ORDER BY d.updatedAt DESC, d.id");
        for (Map<String, Object> row : rows) {
            String text = row.remove("textBody").toString();
            row.put("textLength", text.codePointCount(0, text.length()));
            row.put("searchText", text);
            row.put("preview", text.substring(0, text.offsetByCodePoints(0, Math.min(90, text.codePointCount(0, text.length())))));
            JsonNode source = repository.parse(row.remove("sourceJson"));
            if (source.isObject()) ((com.fasterxml.jackson.databind.node.ObjectNode) source).remove("occurrences");
            row.put("source", source);
        }
        return rows;
    }

    public Map<String, Object> document(String documentId) {
        Map<String, Object> document = repository.one("SELECT * FROM textDocument WHERE id=?", documentId);
        document.put("source", repository.parse(document.remove("sourceJson")));
        document.put("revision", repository.one("SELECT * FROM textRevision WHERE id=?", document.get("currentRevisionId")));
        document.put("snapshot", document.get("currentSnapshotId") == null ? null : snapshot(documentId, document.get("currentSnapshotId").toString()));
        return document;
    }

    public Map<String, Object> create(JsonNode body) {
        String text = requiredText(body, "text"), documentTitle = title(body);
        ImportParser.validateText(text);
        String documentId = transaction.execute(status -> createDocument(documentTitle, text, Map.of("kind", "manual")));
        return document(documentId);
    }

    private String createDocument(String title, String text, Object source) {
        String documentId = identity(), revisionId = identity(), timestamp = now();
        repository.jdbc().update("INSERT INTO textDocument(id,title,currentRevisionId,sourceJson,createdAt,updatedAt) VALUES (?,?,?,?,?,?)", documentId, title, revisionId, repository.json(source), timestamp, timestamp);
        repository.jdbc().update("INSERT INTO textRevision(id,documentId,revisionNumber,textBody,textHash,createdAt) VALUES (?,?,?,?,?,?)", revisionId, documentId, 1, text, fingerprint(text), timestamp);
        return documentId;
    }

    public Map<String, Object> update(String documentId, JsonNode body) {
        String text = requiredText(body, "text"), documentTitle = title(body);
        ImportParser.validateText(text);
        long rowVersion = expectedVersion(body);
        transaction.executeWithoutResult(status -> {
            Map<String, Object> current = document(documentId);
            requireCurrent(current, rowVersion);
            JsonNode currentRevision = repository.parse(repository.json(current.get("revision")));
            boolean textChanged = !text.equals(currentRevision.path("textBody").asText());
            String revisionId = textChanged ? identity() : current.get("currentRevisionId").toString();
            int changed = repository.jdbc().update("UPDATE textDocument SET title=?, currentRevisionId=?, currentSnapshotId=?, rowVersion=rowVersion+1, updatedAt=? WHERE id=? AND rowVersion=? AND archived=FALSE", documentTitle, revisionId, textChanged ? null : current.get("currentSnapshotId"), now(), documentId, rowVersion);
            if (changed != 1) conflict();
            if (textChanged) repository.jdbc().update("INSERT INTO textRevision(id,documentId,revisionNumber,textBody,textHash,createdAt) VALUES (?,?,?,?,?,?)", revisionId, documentId, currentRevision.path("revisionNumber").asInt() + 1, text, fingerprint(text), now());
        });
        return document(documentId);
    }

    private static void requireCurrent(Map<String, Object> document, long rowVersion) {
        if (((Number) document.get("rowVersion")).longValue() != rowVersion) conflict();
        if (Boolean.TRUE.equals(document.get("archived"))) throw new ApiFailure(409, "archived", "请先恢复已归档文本。");
    }
    private static void conflict() { throw new ApiFailure(409, "versionConflict", "内容已在其他页面改变；请重新载入并合并本地修改。"); }

    public Map<String, Object> archive(String documentId, JsonNode body) {
        if (!body.path("archived").isBoolean()) throw new ApiFailure(400, "invalidArchive", "请明确归档或恢复。");
        int changed = repository.jdbc().update("UPDATE textDocument SET archived=?,rowVersion=rowVersion+1,updatedAt=? WHERE id=? AND rowVersion=?", body.path("archived").asBoolean(), now(), documentId, expectedVersion(body));
        if (changed != 1) { document(documentId); conflict(); }
        return document(documentId);
    }

    public Map<String, Object> importFile(String fileName, byte[] bytes) {
        ImportParser.ImportResult parsed = ImportParser.parse(fileName, bytes);
        String safeName = fileName.replace('\\', '/'); safeName = safeName.substring(safeName.lastIndexOf('/') + 1);
        if (safeName.length() > 255) throw new ApiFailure(400, "invalidFileName", "文件名过长。");
        String batchId = identity();
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("batchId", batchId); summary.put("importedCount", parsed.texts().size()); summary.put("skippedCount", parsed.skippedCount());
        String finalName = safeName;
        List<String> documentIds = transaction.execute(status -> {
            repository.jdbc().update("INSERT INTO importBatch(id,fileName,summaryJson,createdAt) VALUES (?,?,?,?)", batchId, finalName, repository.json(summary), now());
            List<String> ids = new ArrayList<>();
            for (ImportParser.ImportedText item : parsed.texts()) {
                Map<String, Object> source = Map.of("kind", "import", "batchId", batchId, "fileName", finalName, "rowNumber", item.rowNumber(), "columnNumber", item.columnNumber(), "columnName", item.columnName());
                String itemTitle = finalName + " · " + item.rowNumber() + ":" + item.columnNumber();
                ids.add(createDocument(itemTitle.substring(0, Math.min(200, itemTitle.length())), item.text(), source));
            }
            return ids;
        });
        summary.put("documentIds", documentIds);
        return summary;
    }

    public Map<String, Object> history(String documentId) {
        repository.one("SELECT id FROM textDocument WHERE id=?", documentId);
        return Map.of("revisions", repository.jdbc().queryForList("SELECT * FROM textRevision WHERE documentId=? ORDER BY revisionNumber DESC", documentId),
                "snapshots", repository.jdbc().queryForList("SELECT id,revisionId,producerKind,baseSnapshotId,jobId,createdAt FROM annotationSnapshot WHERE documentId=? ORDER BY createdAt DESC,id", documentId));
    }

    public Map<String, Object> saveSnapshot(String documentId, JsonNode body) {
        long rowVersion = expectedVersion(body);
        Map<String, Object> document = document(documentId);
        requireCurrent(document, rowVersion);
        String revisionId = requiredText(body, "revisionId");
        if (!revisionId.equals(document.get("currentRevisionId"))) throw new ApiFailure(409, "staleRevision", "文本已改变；旧标注只可在历史修订查看。");
        JsonNode revision = repository.parse(repository.json(document.get("revision")));
        JsonNode layers;
        String producerKind, jobId = null, baseSnapshotId = null;
        if (body.path("candidateId").isTextual()) {
            if (body.has("layers")) throw new ApiFailure(400, "ambiguousSnapshot", "一次只能保存自动候选或人工结果。");
            jobId = body.path("candidateId").asText();
            Map<String, Object> job = repository.one("SELECT * FROM annotationJob WHERE id=? AND documentId=? AND revisionId=?", jobId, documentId, revisionId);
            JsonNode response = repository.parse(job.get("responseJson"));
            if (!List.of("success", "partialFailure").contains(job.get("state")) || !response.has("layers")) throw new ApiFailure(409, "candidateUnavailable", "候选还没有可保存的结果。");
            layers = bridge.invoke(Map.of("action", "validateAutomatic", "request", repository.parse(job.get("requestJson")), "response", response), false).path("layers");
            producerKind = "automatic";
        } else {
            if (!body.path("layers").isObject()) throw new ApiFailure(400, "invalidLayers", "请选择需要保存的标注层。");
            layers = bridge.invoke(Map.of("action", "manual", "text", revision.path("textBody").asText(), "revisionId", revisionId, "layers", body.path("layers")), false).path("layers");
            producerKind = "manual";
            if (body.path("candidateJobId").isTextual()) {
                jobId = body.path("candidateJobId").asText();
                repository.one("SELECT id FROM annotationJob WHERE id=? AND documentId=? AND revisionId=?", jobId, documentId, revisionId);
            }
            if (body.path("baseSnapshotId").isTextual()) {
                baseSnapshotId = body.path("baseSnapshotId").asText();
                repository.one("SELECT id FROM annotationSnapshot WHERE id=? AND documentId=? AND revisionId=?", baseSnapshotId, documentId, revisionId);
            }
        }
        int successfulCount = 0;
        for (JsonNode layer : layers) if ("success".equals(layer.path("status").asText())) successfulCount++;
        if (successfulCount == 0) throw new ApiFailure(400, "emptySnapshot", "至少需要一个有效标注层。");
        if (successfulCount < 4 && !body.path("allowPartial").asBoolean(false)) throw new ApiFailure(409, "partialConfirmationRequired", "并非四层全部成功；请明确选择保存部分结果。");
        String snapshotId = identity(), finalJobId = jobId, finalBaseId = baseSnapshotId, finalKind = producerKind;
        transaction.executeWithoutResult(status -> {
            // Compare-and-set before insert: a concurrent text edit rolls back publication.
            int changed = repository.jdbc().update("UPDATE textDocument SET currentSnapshotId=?,rowVersion=rowVersion+1,updatedAt=? WHERE id=? AND rowVersion=? AND currentRevisionId=? AND archived=FALSE", snapshotId, now(), documentId, rowVersion, revisionId);
            if (changed != 1) conflict();
            repository.jdbc().update("INSERT INTO annotationSnapshot(id,documentId,revisionId,producerKind,baseSnapshotId,jobId,layersJson,createdAt) VALUES (?,?,?,?,?,?,?,?)", snapshotId, documentId, revisionId, finalKind, finalBaseId, finalJobId, repository.json(layers), now());
        });
        return document(documentId);
    }

    public Map<String, Object> snapshot(String documentId, String snapshotId) {
        Map<String, Object> snapshot = repository.one("SELECT * FROM annotationSnapshot WHERE id=? AND documentId=?", snapshotId, documentId);
        JsonNode layers = repository.parse(snapshot.remove("layersJson"));
        snapshot.put("layers", layers);
        snapshot.put("statistics", layerStatistics(layers));
        snapshot.put("revision", repository.one("SELECT * FROM textRevision WHERE id=? AND documentId=?", snapshot.get("revisionId"), documentId));
        return snapshot;
    }

    public Map<String, Object> export(String documentId, String snapshotId) {
        Map<String, Object> snapshot = snapshot(documentId, snapshotId);
        Map<String, Object> document = document(documentId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("exportVersion", "1.0.0"); result.put("exportedAt", now()); result.put("offsetUnit", "unicodeCodePoint");
        result.put("document", Map.of("id", documentId, "title", document.get("title"), "source", document.get("source")));
        result.put("snapshot", snapshot);
        return result;
    }

    public static Map<String, Object> layerStatistics(JsonNode layers) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (String task : List.of("segmentation", "keywords", "pos", "ner")) {
            JsonNode layer = layers.path(task);
            Map<String, Object> metrics = new LinkedHashMap<>();
            String state = layer.path("status").asText("notRequested");
            metrics.put("status", state);
            if (state.equals("success")) {
                JsonNode items = layer.path("result").path("items");
                metrics.put("itemCount", items.size());
                int occurrenceCount = 0;
                Map<String, Integer> labels = new LinkedHashMap<>();
                List<Map<String, Object>> keywords = new ArrayList<>();
                for (JsonNode item : items) {
                    occurrenceCount += item.path("spans").size();
                    if (item.has("label")) labels.merge(item.path("label").asText(), 1, Integer::sum);
                    if (task.equals("keywords")) keywords.add(Map.of("itemText", item.path("itemText").asText(), "count", item.path("spans").size()));
                }
                metrics.put("occurrenceCount", occurrenceCount); metrics.put("labels", labels);
                if (task.equals("keywords")) metrics.put("keywords", keywords);
            } else { metrics.put("itemCount", null); metrics.put("occurrenceCount", null); }
            result.put(task, metrics);
        }
        return result;
    }

    public String exportText(String documentId, String snapshotId) {
        JsonNode data = repository.parse(repository.json(export(documentId, snapshotId)));
        StringBuilder output = new StringBuilder("# " + data.path("document").path("title").asText() + "\n\n");
        output.append(data.path("snapshot").path("revision").path("textBody").asText()).append("\n\n");
        for (String task : List.of("segmentation", "keywords", "pos", "ner")) {
            JsonNode layer = data.path("snapshot").path("layers").path(task);
            output.append("## ").append(task).append(" · ").append(layer.path("status").asText()).append('\n');
            for (JsonNode item : layer.path("result").path("items")) output.append("- ").append(item.path("itemText").asText()).append(" ").append(item.path("label").asText("")).append(" ").append(item.path("spans")).append('\n');
            output.append('\n');
        }
        return output.toString();
    }

    public Map<String, Object> statistics() {
        List<Map<String, Object>> rows = repository.jdbc().queryForList("SELECT d.id,s.layersJson FROM textDocument d LEFT JOIN annotationSnapshot s ON s.id=d.currentSnapshotId AND s.revisionId=d.currentRevisionId WHERE d.archived=FALSE");
        Map<String, Integer> itemCounts = new LinkedHashMap<>(), coverage = new LinkedHashMap<>(), entityLabels = new LinkedHashMap<>(), posLabels = new LinkedHashMap<>(), keywords = new LinkedHashMap<>();
        int savedCount = 0;
        for (String task : List.of("segmentation", "keywords", "pos", "ner")) { itemCounts.put(task, 0); coverage.put(task, 0); }
        for (Map<String, Object> row : rows) {
            JsonNode layers = repository.parse(row.get("layersJson"));
            if (!layers.isNull()) savedCount++;
            for (String task : itemCounts.keySet()) {
                JsonNode layer = layers.path(task);
                if (!"success".equals(layer.path("status").asText())) continue;
                coverage.merge(task, 1, Integer::sum);
                JsonNode items = layer.path("result").path("items"); itemCounts.merge(task, items.size(), Integer::sum);
                for (JsonNode item : items) {
                    if (task.equals("ner")) entityLabels.merge(item.path("label").asText(), 1, Integer::sum);
                    if (task.equals("pos")) posLabels.merge(item.path("label").asText(), 1, Integer::sum);
                    if (task.equals("keywords")) keywords.merge(item.path("itemText").asText(), item.path("spans").size(), Integer::sum);
                }
            }
        }
        List<Map<String, Object>> topKeywords = keywords.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey())).limit(20).map(entry -> Map.<String, Object>of("itemText", entry.getKey(), "count", entry.getValue())).toList();
        return Map.of("documentCount", rows.size(), "savedCount", savedCount, "itemCounts", itemCounts, "coverage", coverage, "entityLabels", entityLabels, "posLabels", posLabels, "keywords", topKeywords);
    }
}
