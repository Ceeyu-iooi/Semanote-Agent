package io.semanote.api;

import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.junit.jupiter.api.Assertions.*;

class LocalOriginFilterTest {
    private boolean passes(String configured, String host, String origin, String fetchSite) throws Exception {
        var request = new MockHttpServletRequest("POST", "/api/v1/documents");
        request.setLocalPort(8080); request.addHeader("Host", host);
        if (origin != null) request.addHeader("Origin", origin);
        if (fetchSite != null) request.addHeader("Sec-Fetch-Site", fetchSite);
        var response = new MockHttpServletResponse();
        var passed = new AtomicBoolean(false);
        new LocalOriginFilter(configured).doFilter(request, response, (incoming, outgoing) -> passed.set(true));
        return passed.get();
    }
    @Test void loopbackRemainsAvailableByDefault() throws Exception {
        assertTrue(passes("", "127.0.0.1:8080", "http://127.0.0.1:8080", "same-origin"));
        assertFalse(passes("", "192.168.1.20:8080", "http://192.168.1.20:8080", "same-origin"));
    }
    @Test void configuredLanAllowsItsOwnOriginOnly() throws Exception {
        assertTrue(passes("192.168.1.20", "192.168.1.20:8080", "http://192.168.1.20:8080", "same-origin"));
        assertFalse(passes("192.168.1.20", "192.168.1.21:8080", "http://192.168.1.21:8080", "same-origin"));
        assertFalse(passes("192.168.1.20", "192.168.1.20:8080", "https://example.com", "cross-site"));
        assertFalse(passes("192.168.1.20", "example.com:8080", null, null));
    }
    @Test void publicAddressesAndHostnamesCannotExpandTheAllowlist() {
        assertThrows(IllegalArgumentException.class, () -> new LocalOriginFilter("example.com"));
        assertThrows(IllegalArgumentException.class, () -> new LocalOriginFilter("8.8.8.8"));
    }
}
