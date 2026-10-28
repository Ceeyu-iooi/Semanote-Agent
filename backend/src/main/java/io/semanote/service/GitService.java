package io.semanote.service;

import io.semanote.api.ApiFailure;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Read current repository history through fixed Git commands; never accept paths or shell expressions. */
@Service
public class GitService {
    private final Path root;
    public GitService(@Value("${semanote.project-root}") String root) { this.root = Path.of(root).toAbsolutePath().normalize(); }

    private String git(String... arguments) {
        Process process = null;
        try {
            List<String> command = new ArrayList<>(List.of("git", "--no-pager", "-c", "core.quotepath=false"));
            command.addAll(List.of(arguments));
            process = new ProcessBuilder(command).directory(root.toFile()).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            Process active = process;
            var output = CompletableFuture.supplyAsync(() -> {
                try { return active.getInputStream().readNBytes(1024 * 1024 + 1); }
                catch (Exception exception) { throw new IllegalStateException(exception); }
            });
            if (!process.waitFor(10, TimeUnit.SECONDS)) throw new IllegalStateException("Git timeout");
            byte[] bytes = output.get(2, TimeUnit.SECONDS);
            if (process.exitValue() != 0 || bytes.length > 1024 * 1024) throw new IllegalStateException("Git output unavailable");
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (Exception exception) { throw new ApiFailure(503, "gitUnavailable", "Git 记录暂不可读，请确认项目仓库可访问。"); }
        finally { if (process != null && process.isAlive()) process.destroyForcibly(); }
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
        return Map.of("id", revision, "summary", git("show", "--format=fuller", "--stat", "--no-renames", revision, "--"),
                "patch", git("show", "--format=", "--first-parent", "--no-ext-diff", "--no-renames", "--unified=3", revision, "--", "README.md", "AGENTS.md", "CHANGELOG.md", "frontend/src", "backend/src", "semanote_agent", "tools", "docs/*.md"));
    }
}
