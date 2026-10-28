package io.semanote.api;

import com.fasterxml.jackson.databind.JsonNode;
import io.semanote.service.JobService;
import io.semanote.service.WorkspaceService;
import io.semanote.service.GitService;
import io.semanote.service.ModelSettingsService;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/** Versioned HTTP boundary. Model calls remain in the durable job service. */
@RestController
@RequestMapping("/api/v1")
public class WorkspaceController {
    private final WorkspaceService workspace;
    private final JobService jobs;
    private final GitService git;
    private final ModelSettingsService modelSettings;
    public WorkspaceController(WorkspaceService workspace, JobService jobs, GitService git, ModelSettingsService modelSettings) { this.workspace = workspace; this.jobs = jobs; this.git = git; this.modelSettings=modelSettings; }

    @GetMapping("/health") public Map<String, Object> health() { return Map.of("status", "ready", "contractVersion", "1.0.0"); }
    @GetMapping("/meta") public Map<String, Object> meta() {
        return Map.of("tasks", List.of("segmentation", "keywords", "pos", "ner"),
                "entityLabels", List.of("PERSON", "LOCATION", "ORGANIZATION", "TIME", "MONEY"),
                "posLabels", List.of("ADJ", "ADP", "ADV", "AUX", "CCONJ", "DET", "INTJ", "NOUN", "NUM", "PART", "PRON", "PROPN", "PUNCT", "SCONJ", "SYM", "VERB", "X"),
                "maxTextLength", 10000, "maxBatchSize", 500, "maxFileBytes", 5242880, "offsetUnit", "unicodeCodePoint");
    }
    @GetMapping("/documents") public Object documents() { return workspace.documents(); }
    @PostMapping("/documents") public ResponseEntity<?> create(@RequestBody JsonNode body) { return ResponseEntity.status(201).body(workspace.create(body)); }
    @GetMapping("/documents/{id}") public Object document(@PathVariable String id) { return workspace.document(id); }
    @PutMapping("/documents/{id}") public Object update(@PathVariable String id, @RequestBody JsonNode body) { return workspace.update(id, body); }
    @PostMapping("/documents/{id}/archive") public Object archive(@PathVariable String id, @RequestBody JsonNode body) { return workspace.archive(id, body); }
    @GetMapping("/documents/{id}/revisions") public Object history(@PathVariable String id) { return workspace.history(id); }
    @PostMapping("/imports") public Object importFile(@RequestParam("file") MultipartFile file) throws IOException { return workspace.importFile(file.getOriginalFilename() == null ? "upload" : file.getOriginalFilename(), file.getBytes()); }
    @PostMapping("/jobs") public ResponseEntity<?> start(@RequestBody JsonNode body) { return ResponseEntity.accepted().body(jobs.start(body)); }
    @GetMapping("/jobs") public Object jobs() { return jobs.list(); }
    @GetMapping("/jobs/{id}") public Object job(@PathVariable String id) { return jobs.job(id); }
    @PostMapping("/jobs/{id}/retry") public ResponseEntity<?> retry(@PathVariable String id, @RequestBody JsonNode body) { return ResponseEntity.accepted().body(jobs.retry(id, body)); }
    @PostMapping("/documents/{id}/snapshots") public Object saveSnapshot(@PathVariable String id, @RequestBody JsonNode body) { return workspace.saveSnapshot(id, body); }
    @GetMapping("/documents/{id}/snapshots/{snapshotId}") public Object snapshot(@PathVariable String id, @PathVariable String snapshotId) { return workspace.snapshot(id, snapshotId); }
    @GetMapping(value="/documents/{id}/exports/{snapshotId}")
    public ResponseEntity<?> export(@PathVariable String id, @PathVariable String snapshotId, @RequestParam(defaultValue="json") String format) {
        if (List.of("txt", "md").contains(format)) return ResponseEntity.ok().contentType(new MediaType("text", "plain", java.nio.charset.StandardCharsets.UTF_8)).header("Content-Disposition", "attachment; filename=semanote-" + safeIdentity(snapshotId) + "." + format).body(workspace.exportText(id, snapshotId));
        if (!"json".equals(format)) throw new ApiFailure(400, "invalidExportFormat", "请选择 JSON、TXT 或 Markdown。");
        return ResponseEntity.ok().header("Content-Disposition", "attachment; filename=semanote-" + safeIdentity(snapshotId) + ".json").body(workspace.export(id, snapshotId));
    }
    private String safeIdentity(String value) { return value.replaceAll("[^A-Za-z0-9_-]", ""); }
    @GetMapping("/statistics") public Object statistics() { return workspace.statistics(); }
    @GetMapping("/development/git") public Object gitHistory() { return git.history(); }
    @GetMapping("/development/git/{revision}") public Object gitChanges(@PathVariable String revision) { return git.changes(revision); }
    @GetMapping("/settings/model") public Object modelSettings() { return modelSettings.read(); }
    @PutMapping("/settings/model") public Object updateModelSettings(@RequestBody JsonNode body) { return modelSettings.save(body); }
}
