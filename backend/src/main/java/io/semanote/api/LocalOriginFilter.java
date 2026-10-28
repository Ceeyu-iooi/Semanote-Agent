package io.semanote.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Reject cross-site writes to the local workspace, including multipart form posts. */
@Component
public class LocalOriginFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String origin = request.getHeader("Origin");
        boolean writes = !Set.of("GET", "HEAD", "OPTIONS").contains(request.getMethod());
        Set<String> allowed = Set.of("http://127.0.0.1:" + request.getLocalPort(), "http://localhost:" + request.getLocalPort(), "http://127.0.0.1:5173", "http://localhost:5173");
        String host = request.getHeader("Host");
        boolean localHost = Set.of("127.0.0.1:" + request.getLocalPort(), "localhost:" + request.getLocalPort()).contains(host == null ? "" : host);
        if (!localHost || (writes && ((origin != null && !allowed.contains(origin)) || "cross-site".equals(request.getHeader("Sec-Fetch-Site"))))) {
            response.setStatus(403); response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"error\":{\"code\":\"originRejected\",\"message\":\"请从本地文本工作台执行此操作。\"}}");
            return;
        }
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
        chain.doFilter(request, response);
    }
}
