package io.semanote.api;

import com.fasterxml.jackson.databind.JsonNode;
import io.semanote.service.JobService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.filter.OncePerRequestFilter;

@RestController
public class ShutdownController {
    private final Gate gate;
    private final JobService jobs;
    private final ConfigurableApplicationContext application;
    private final String token;
    private final String node;
    private final Path root;

    public ShutdownController(Gate gate, JobService jobs, ConfigurableApplicationContext application,
                              @Value("${semanote.managed-token}") String token,
                              @Value("${semanote.node}") String node,
                              @Value("${semanote.project-root}") String root) {
        this.gate = gate;
        this.jobs = jobs;
        this.application = application;
        this.token = token;
        this.node = node;
        this.root = Path.of(root).toAbsolutePath().normalize();
    }

    @PostMapping("/api/v1/shutdown")
    public void shutdown(@RequestBody JsonNode body, HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        String supplied = request.getHeader("X-Semanote-Managed-Token");
        boolean command = supplied != null && MessageDigest.isEqual(
                token.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8));
        int port = request.getLocalPort();
        String authority = request.getHeader("Host");
        String origin = request.getHeader("Origin");
        boolean browser = Set.of("localhost:" + port, "127.0.0.1:" + port).contains(authority)
                && origin != null && (origin.equals("http://" + authority) || port == 8081
                && Set.of("http://localhost:5173", "http://127.0.0.1:5173").contains(origin));
        if (token.isBlank() || !InetAddress.getByName(request.getRemoteAddr()).isLoopbackAddress()
                || (!command && !browser)) {
            throw new ApiFailure(403, "localShutdownOnly", "请在运行服务的电脑上，通过本机地址退出。");
        }
        if (!body.path("confirm").isBoolean() || !body.path("confirm").asBoolean())
            throw new ApiFailure(400, "shutdownConfirmationRequired", "请确认关闭本地服务。");

        var lock = gate.lock.writeLock();
        if (!lock.tryLock()) throw busy();
        try {
            if (gate.draining || jobs.busy()) throw busy();
            gate.draining = true;
        } finally { lock.unlock(); }

        boolean includeDatabase = !command || body.path("database").asBoolean(true);
        try {
            if (includeDatabase) stopDatabase();
        } catch (InterruptedException interrupted) {
            gate.draining = false;
            Thread.currentThread().interrupt();
            throw shutdownFailed();
        } catch (IOException failure) {
            gate.draining = false;
            throw shutdownFailed();
        }
        try {
            response.setContentType("application/json");
            response.getWriter().write("{\"status\":\"stopped\",\"database\":" + includeDatabase + "}");
            response.flushBuffer();
        } finally {
            Thread.ofPlatform().name("semanote-shutdown").start(() ->
                    System.exit(SpringApplication.exit(application)));
        }
    }

    private void stopDatabase() throws IOException, InterruptedException {
        var process = new ProcessBuilder(node, "tools/local-web.mjs", "shutdown-managed-database")
                .directory(root.toFile()).redirectOutput(ProcessBuilder.Redirect.DISCARD)
                .redirectError(ProcessBuilder.Redirect.DISCARD).start();
        try {
            if (!process.waitFor(45, TimeUnit.SECONDS) || process.exitValue() != 0)
                throw new IOException("Owned database did not shut down");
        } finally {
            if (process.isAlive()) process.destroyForcibly();
        }
    }

    private static ApiFailure busy() {
        return new ApiFailure(409, "shutdownBusy", "请等待正在进行的导入、保存和标注任务完成后再退出。");
    }

    private static ApiFailure shutdownFailed() {
        return new ApiFailure(503, "shutdownFailed", "数据库未能安全关闭，请检查本机服务状态。");
    }

    /** Track ongoing API work so an exit cannot interrupt a database transaction. */
    @Component
    public static class Gate extends OncePerRequestFilter {
        private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();
        private volatile boolean draining;

        @Override
        protected boolean shouldNotFilter(HttpServletRequest request) {
            String path = request.getServletPath();
            return !path.startsWith("/api/v1/") || path.equals("/api/v1/shutdown");
        }

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws IOException, ServletException {
            var guard = lock.readLock();
            guard.lock();
            try {
                if (draining) {
                    response.setStatus(503);
                    response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write("{\"error\":{\"code\":\"shuttingDown\",\"message\":\"服务正在关闭。\"}}");
                } else chain.doFilter(request, response);
            } finally { guard.unlock(); }
        }
    }
}
