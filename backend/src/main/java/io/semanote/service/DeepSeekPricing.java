package io.semanote.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.Map;

/** Reference CNY prices checked against the official 2026-11-19 tariff. */
final class DeepSeekPricing {
    static final String source = "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/";
    static final ZoneId china = ZoneId.of("Asia/Shanghai");
    private static final Map<Integer, String[]> holidays = Map.of(
            2026, new String[]{"0101-0103","0215-0223","0404-0406","0501-0505","0619-0621","0925-0927","1001-1007"},
            2027, new String[]{"0101-0103","0205-0213","0403-0405","0501-0505","0609-0609","0915-0915","1001-1007"});

    private DeepSeekPricing() {}

    static boolean count(JsonNode value) {
        return value.isIntegralNumber() && value.canConvertToLong() && value.asLong() >= 0;
    }

    static Double value(JsonNode row) {
        if ("local".equals(row.path("cache").asText())) return 0d;
        var input = row.path("promptTokens");
        var output = row.path("completionTokens");
        var cached = row.path("cachedTokens");
        if (!count(input) || !count(output) || !count(cached) || cached.asLong() > input.asLong()) return null;
        String model = "deepseek".equals(row.path("provider").asText())
                ? row.path("resolvedModel").asText(row.path("model").asText()).toLowerCase(java.util.Locale.ROOT)
                : "deepseek-flash";
        double[] rates;
        if (model.matches("deepseek-(v4(\\.1)?-)?flash(?:-.*)?")) rates = new double[]{0.04, 2, 8};
        else if (model.matches("deepseek-v4-pro(?:-.*)?")) rates = new double[]{0.30, 9, 27};
        else return null;
        try {
            var time = Instant.parse(row.path("startedAt").asText()).atZone(china);
            var yearHolidays = holidays.get(time.getYear());
            if (yearHolidays == null) return null;
            int date = time.getMonthValue() * 100 + time.getDayOfMonth();
            boolean holiday = false;
            for (String range : yearHolidays) {
                holiday |= date >= Integer.parseInt(range.substring(0, 4)) && date <= Integer.parseInt(range.substring(5));
            }
            int hour = time.getHour();
            boolean peak = !holiday && time.getDayOfWeek().getValue() <= 5
                    && ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 18));
            return (cached.asLong() * rates[0] + (input.asLong() - cached.asLong()) * rates[1]
                    + output.asLong() * rates[2]) * (peak ? 1d : 0.5d) / 1_000_000;
        } catch (DateTimeParseException invalid) { return null; }
    }
}
