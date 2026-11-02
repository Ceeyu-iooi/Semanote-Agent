package io.semanote.service;

import io.semanote.api.ApiFailure;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Read current repository history through fixed Git commands; never accept paths or shell expressions. */
@Service
public class GitService {
    private final Path root;
    public GitService(@Value("${semanote.project-root}") String root) { this.root = Path.of(root).toAbsolutePath().normalize(); }

    private record GitOutput(String text, boolean truncated) {}

    private GitOutput gitOutput(String... arguments) {
        Process process = null;
        try {
            List<String> command = new ArrayList<>(List.of("git", "--no-pager", "-c", "core.quotepath=false"));
            command.addAll(List.of(arguments));
            process = new ProcessBuilder(command).directory(root.toFile()).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            Process active = process;
            var output = CompletableFuture.supplyAsync(() -> {
                try (var input = active.getInputStream(); var buffer = new ByteArrayOutputStream()) {
                    byte[] block = new byte[8192]; int length; boolean truncated = false;
                    while ((length = input.read(block)) >= 0) {
                        int available = Math.max(0, 1024 * 1024 - buffer.size());
                        if (length > available) truncated = true;
                        buffer.write(block, 0, Math.min(length, available));
                    }
                    return new GitOutput(buffer.toString(StandardCharsets.UTF_8), truncated);
                }
                catch (Exception exception) { throw new IllegalStateException(exception); }
            });
            if (!process.waitFor(10, TimeUnit.SECONDS)) throw new IllegalStateException("Git timeout");
            GitOutput result = output.get(2, TimeUnit.SECONDS);
            if (process.exitValue() != 0) throw new IllegalStateException("Git output unavailable");
            return result;
        } catch (Exception exception) { throw new ApiFailure(503, "gitUnavailable", "Git 记录暂不可读，请确认项目仓库可访问。"); }
        finally { if (process != null && process.isAlive()) process.destroyForcibly(); }
    }

    private String git(String... arguments) {
        GitOutput output = gitOutput(arguments);
        if (output.truncated()) throw new ApiFailure(503, "gitOutputLimit", "Git 记录超出当前展示范围。");
        return output.text();
    }

    public Object history() {
        List<Map<String, Object>> commits = new ArrayList<>();
        for (String line : git("log", "--all", "--topo-order", "--max-count=200", "--format=%H%x09%P%x09%cI%x09%D%x09%s").split("\\R")) {
            String[] fields = line.split("\\t", 5);
            if (fields.length == 5) commits.add(Map.of("id", fields[0], "parents", fields[1].isBlank() ? List.of() : List.of(fields[1].split(" ")), "date", fields[2], "refs", fields[3], "subject", fields[4]));
        }
        return Map.of("branch", git("branch", "--show-current").strip(), "head", git("rev-parse", "HEAD").strip(), "commits", commits, "limit", 200);
    }

    public Object changes(String revision) {
        if (!revision.matches("[a-f0-9]{40}")) throw new ApiFailure(400, "invalidRevision", "请选择有效提交。");
        List<Map<String, Object>> files = new ArrayList<>();
        for (String line : git("show", "--format=", "--first-parent", "--root", "--numstat", "--no-renames", "-z", revision, "--").split("\u0000")) {
            String[] fields = line.split("\\t", 3);
            if (fields.length != 3) continue;
            Map<String, Object> file = new HashMap<>();
            file.put("path", fields[2]); file.put("binary", fields[0].equals("-"));
            file.put("additions", fields[0].equals("-") ? null : Integer.valueOf(fields[0]));
            file.put("deletions", fields[1].equals("-") ? null : Integer.valueOf(fields[1]));
            files.add(file);
        }
        GitOutput patch = gitOutput("show", "--format=", "--first-parent", "--no-ext-diff", "--no-renames", "--unified=3", revision, "--", "README.md", "AGENTS.md", "CHANGELOG.md", "frontend/src", "frontend/tests", "frontend/package.json", "backend/src", "backend/pom.xml", "agent", "tools", "docs/*.md", "docs/design/tokens.css", "docs/design/preview.css", "docs/design/preview.js");
        return Map.of("id", revision, "files", files, "patch", patch.text(), "patchTruncated", patch.truncated(), "comparison", "firstParent",
                "summary", git("show", "--format=fuller", "--first-parent", "--stat", "--no-renames", revision, "--"));
    }
}
