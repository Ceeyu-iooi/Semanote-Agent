package io.semanote.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import io.semanote.api.ApiFailure;

/** Executes a fixed local program, with JSON through pipes and no command shell. */
@Component
public class AgentBridge {
    private final ObjectMapper mapper;
    private final Path projectRoot;
    private final String python;

    public AgentBridge(ObjectMapper mapper, @Value("${semanote.project-root}") String projectRoot,
                       @Value("${semanote.python}") String python) {
        this.mapper = mapper;
        this.projectRoot = Path.of(projectRoot).toAbsolutePath().normalize();
        this.python = python;
    }

    public JsonNode invoke(Object envelope, boolean remote) {
        Process process = null;
        try {
            process = new ProcessBuilder(python, "-X", "utf8", "-B", "tools/agent_bridge.py")
                    .directory(projectRoot.toFile()).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            Process activeProcess = process;
            CompletableFuture<byte[]> output = CompletableFuture.supplyAsync(() -> {
                try { return activeProcess.getInputStream().readNBytes(8 * 1024 * 1024 + 1); }
                catch (IOException exception) { return new byte[0]; }
            });
            try (var input = process.getOutputStream()) { input.write(mapper.writeValueAsBytes(envelope)); }
            if (!process.waitFor(remote ? 300 : 20, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new ApiFailure(503, "agentTimeout", "调用超时，未自动重发；请核对后显式重试。");
            }
            byte[] bytes = output.get(5, TimeUnit.SECONDS);
            if (bytes.length > 8 * 1024 * 1024) throw new IOException("Output limit");
            JsonNode result = mapper.readTree(new String(bytes, StandardCharsets.UTF_8));
            if (process.exitValue() != 0 || result == null || result.has("error")) {
                throw new ApiFailure(400, "invalidAnnotation", result != null && result.has("error")
                        ? result.path("error").path("message").asText("标注未通过校验。") : "智能体未返回有效数据。");
            }
            return result;
        } catch (ApiFailure failure) { throw failure; }
        catch (Exception exception) {
            if (exception instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new ApiFailure(503, "agentUnavailable", "智能体暂不可用，请检查本地 Python 与模型配置。");
        } finally { if (process != null && process.isAlive()) process.destroyForcibly(); }
    }
}
