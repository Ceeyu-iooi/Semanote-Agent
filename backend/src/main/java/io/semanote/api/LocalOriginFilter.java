package io.semanote.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.InetAddress;
import java.util.HashSet;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Allow configured local/LAN authorities while rejecting cross-site writes and DNS rebinding. */
@Component
public class LocalOriginFilter extends OncePerRequestFilter {
    private final Set<String> allowedHosts = new HashSet<>(Set.of("127.0.0.1", "localhost"));

    public LocalOriginFilter(@Value("${semanote.lan-hosts:}") String lanHosts) {
        for (String value : lanHosts.split(",")) {
            String host = value.strip();
            if (host.isEmpty()) continue;
            try {
                if (!host.matches("\\d{1,3}(\\.\\d{1,3}){3}") || !InetAddress.getByName(host).isSiteLocalAddress()) {
                    throw new IllegalArgumentException("LAN hosts must be private IPv4 addresses");
                }
            } catch (java.net.UnknownHostException exception) {
                throw new IllegalArgumentException("Invalid LAN IPv4 address");
            }
            allowedHosts.add(host);
        }
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String origin = request.getHeader("Origin");
        boolean writes = !Set.of("GET", "HEAD", "OPTIONS").contains(request.getMethod());
        Set<String> authorities = new HashSet<>();
        Set<String> allowedOrigins = new HashSet<>(Set.of("http://127.0.0.1:5173", "http://localhost:5173"));
        for (String allowedHost : allowedHosts) {
            String authority = allowedHost + ":" + request.getLocalPort();
            authorities.add(authority);
            allowedOrigins.add("http://" + authority);
        }
        String host = request.getHeader("Host");
        boolean allowedAuthority = authorities.contains(host == null ? "" : host);
        if (!allowedAuthority || (writes && ((origin != null && !allowedOrigins.contains(origin)) || "cross-site".equals(request.getHeader("Sec-Fetch-Site"))))) {
            response.setStatus(403); response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"error\":{\"code\":\"originRejected\",\"message\":\"请从已配置的文本工作台地址执行此操作。\"}}");
            return;
        }
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
        chain.doFilter(request, response);
    }
}
