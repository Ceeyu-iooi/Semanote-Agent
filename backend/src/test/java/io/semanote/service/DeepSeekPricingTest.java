package io.semanote.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DeepSeekPricingTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test void pricesReportedTokensInChinaTime() {
        var row = mapper.createObjectNode().put("provider", "deepseek").put("model", "deepseek-flash")
                .put("cache", "hit").put("promptTokens", 1_000_000).put("completionTokens", 1_000_000)
                .put("cachedTokens", 500_000);
        for (String offPeak : new String[]{"2026-11-19T00:59:59Z", "2026-11-19T04:00:00Z",
                "2026-11-21T01:00:00Z", "2026-10-01T02:00:00Z", "2027-06-09T02:00:00Z"}) {
            assertEquals(4.51, DeepSeekPricing.value(row.put("startedAt", offPeak)), 1e-8);
        }
        assertEquals(9.02, DeepSeekPricing.value(row.put("startedAt", "2026-11-19T01:00:00Z")), 1e-8);
        assertEquals(31.65, DeepSeekPricing.value(row.put("model", "deepseek-v4-pro")), 1e-8);
        assertNull(DeepSeekPricing.value(row.putNull("cachedTokens")));
        assertEquals(0d, DeepSeekPricing.value(row.put("cache", "local")));
    }
}
