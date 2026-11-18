package io.semanote.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class ModelLogServiceTest {
    @TempDir Path root;
    @Test void taskSeriesCombinesCallsBeforePaginationAndPreservesUnknownUsage() throws Exception {
        Path dir = root.resolve("profile/runtime/model-logs"); Files.createDirectories(dir);
        Files.writeString(dir.resolve("00000000-0000-0000-0000-000000000001.json"), "{\"id\":\"a\",\"jobId\":\"job-one\",\"startedAt\":\"2026-01-02\",\"cache\":\"miss\",\"promptTokens\":100,\"completionTokens\":20,\"cachedTokens\":40}");
        Files.writeString(dir.resolve("00000000-0000-0000-0000-000000000002.json"), "{\"id\":\"b\",\"jobId\":\"job-one\",\"startedAt\":\"2026-01-01\",\"cache\":\"local\"}");
        Files.writeString(dir.resolve("00000000-0000-0000-0000-000000000003.json"), "{\"id\":\"c\",\"jobId\":\"job-two\",\"startedAt\":\"2025-12-01\",\"cache\":\"miss\",\"promptTokens\":null,\"completionTokens\":null}");
        Map<?,?> response = (Map<?,?>) new ModelLogService(new ObjectMapper(), root.toString()).list("","","","","",1,1,"time");
        List<?> series = (List<?>) response.get("taskSeries"); assertEquals(2, series.size());
        Map<?,?> first = (Map<?,?>) series.get(0); assertEquals(100L,first.get("promptTokens")); assertEquals(1L,first.get("localHits"));
        Map<?,?> second = (Map<?,?>) series.get(1); assertNull(second.get("promptTokens")); assertNull(second.get("cachedTokens"));
        assertEquals(1, ((List<?>) response.get("rows")).size());
        List<?> days = (List<?>) response.get("dailySeries");
        assertEquals(3, days.size());
        assertNull(((Map<?,?>) days.get(0)).get("promptTokens"));
        assertEquals(1L, ((Map<?,?>) days.get(1)).get("localHits"));
        assertEquals(40L, ((Map<?,?>) days.get(2)).get("cachedTokens"));
    }

    @Test void dailySeriesUsesShanghaiDateAndAggregatesAcrossPages() throws Exception {
        Path dir = root.resolve("profile/runtime/model-logs"); Files.createDirectories(dir);
        Files.writeString(dir.resolve("00000000-0000-0000-0000-000000000001.json"), "{\"startedAt\":\"2026-01-01T17:00:00Z\",\"cache\":\"miss\",\"promptTokens\":100,\"completionTokens\":20,\"cachedTokens\":50}");
        Files.writeString(dir.resolve("00000000-0000-0000-0000-000000000002.json"), "{\"startedAt\":\"2026-01-02T02:00:00Z\",\"cache\":\"miss\",\"promptTokens\":200,\"completionTokens\":30,\"cachedTokens\":100}");
        Map<?,?> response = (Map<?,?>) new ModelLogService(new ObjectMapper(), root.toString()).list("","","","","",1,1,"time");
        List<?> series = (List<?>) response.get("dailySeries"); assertEquals(1, series.size());
        Map<?,?> day = (Map<?,?>) series.get(0); assertEquals("2026-01-02", day.get("date"));
        assertEquals(300L, day.get("promptTokens")); assertEquals(150L, day.get("cachedTokens"));
    }
}
