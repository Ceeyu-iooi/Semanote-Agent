package io.semanote.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Metadata files are written atomically by the independent Node agent. */
@Service
public class ModelLogService {
    private final Path directory;private final ObjectMapper mapper;
    public ModelLogService(ObjectMapper mapper,@Value("${semanote.project-root}") String root){this.mapper=mapper;directory=Path.of(root).resolve("profile/runtime/model-logs");}
    public Object list(String provider,String model,String state,String cache,String query,int page,int size,String sort){
        List<JsonNode> all=new ArrayList<>();int unreadable=0;
        try {
            if(Files.isDirectory(directory))try(var paths=Files.list(directory)){
                for(Path file:paths.filter(path->path.getFileName().toString().matches("[a-f0-9-]{36}\\.json")).toList()){
                    try{if(Files.size(file)>65536){unreadable++;continue;}all.add(mapper.readTree(Files.readAllBytes(file)));}catch(Exception exception){unreadable++;}
                }
            }
        }catch(Exception exception){throw new io.semanote.api.ApiFailure(500,"logsUnavailable","调用记录暂不可读。");}
        List<JsonNode> filtered=all.stream().filter(row->(provider.isEmpty()||provider.equals(row.path("provider").asText()))&&(model.isEmpty()||model.equals(row.path("model").asText()))&&(state.isEmpty()||state.equals(row.path("state").asText()))&&(cache.isEmpty()||cache.equals(row.path("cache").asText()))&&(query.isEmpty()||(row.path("id").asText()+row.path("jobId").asText()+row.path("model").asText()).contains(query))).sorted("duration".equals(sort)?Comparator.comparingLong((JsonNode row)->row.path("durationMs").asLong()).reversed():Comparator.comparing((JsonNode row)->row.path("startedAt").asText()).reversed()).toList();
        Map<String,Long> counts=new LinkedHashMap<>();for(String key:List.of("calls","localHits","failures","promptTokens","completionTokens","cachedTokens","durationMs","unknownUsage","unknownCacheUsage"))counts.put(key,0L);
        for(JsonNode row:filtered){boolean local="local".equals(row.path("cache").asText());counts.merge(local?"localHits":"calls",1L,Long::sum);if("failed".equals(row.path("state").asText()))counts.merge("failures",1L,Long::sum);if(!local&&(!row.path("promptTokens").isNumber()||!row.path("completionTokens").isNumber()))counts.merge("unknownUsage",1L,Long::sum);if(!local&&!row.path("cachedTokens").isNumber())counts.merge("unknownCacheUsage",1L,Long::sum);for(String key:List.of("promptTokens","completionTokens","cachedTokens","durationMs"))counts.merge(key,row.path(key).asLong(0),Long::sum);}
        int safeSize=Math.clamp(size,1,100),safePage=Math.max(1,page),start=(int)Math.min((long)(safePage-1)*safeSize,filtered.size());
        // Group the filtered call records by real job identity before applying table pagination.
        Map<String,List<JsonNode>> jobs = new LinkedHashMap<>();
        filtered.stream().filter(row -> !row.path("jobId").asText().isBlank())
            .sorted(Comparator.comparing((JsonNode row) -> row.path("startedAt").asText()).reversed())
            .forEach(row -> jobs.computeIfAbsent(row.path("jobId").asText(), key -> new ArrayList<>()).add(row));
        List<Map<String,Object>> taskSeries = new ArrayList<>();
        for (var entry : jobs.entrySet()) {
            if (taskSeries.size() == 50) break;
            long prompt=0, completion=0, cached=0, localHits=0; boolean usageKnown=true, cacheKnown=true; int remote=0;
            for (JsonNode row : entry.getValue()) {
                if ("local".equals(row.path("cache").asText())) { localHits++; continue; }
                remote++;
                if (!row.path("promptTokens").isNumber() || !row.path("completionTokens").isNumber()) usageKnown=false;
                else { prompt+=row.path("promptTokens").asLong(); completion+=row.path("completionTokens").asLong(); }
                if (!row.path("cachedTokens").isNumber()) cacheKnown=false; else cached+=row.path("cachedTokens").asLong();
            }
            Map<String,Object> point = new LinkedHashMap<>();
            point.put("jobId",entry.getKey()); point.put("startedAt",entry.getValue().get(0).path("startedAt").asText());
            point.put("promptTokens",usageKnown ? prompt : null); point.put("completionTokens",usageKnown ? completion : null);
            point.put("cachedTokens",cacheKnown && usageKnown ? cached : null); point.put("remoteCalls",remote); point.put("localHits",localHits);
            taskSeries.add(point);
        }
        Map<String,List<JsonNode>> days = new TreeMap<>();
        for (JsonNode row : filtered) {
            try {
                String timestamp = row.path("startedAt").asText();
                String day = timestamp.length() == 10 ? LocalDate.parse(timestamp).toString() : Instant.parse(timestamp).atZone(ZoneId.of("Asia/Shanghai")).toLocalDate().toString();
                days.computeIfAbsent(day, key -> new ArrayList<>()).add(row);
            } catch (RuntimeException ignored) { /* Invalid timestamps cannot be placed on a date axis. */ }
        }
        List<Map<String,Object>> dailySeries = new ArrayList<>();
        for (var day : days.entrySet()) {
            long prompt=0, completion=0, cached=0, localHits=0; int remote=0; boolean usageKnown=true, cacheKnown=true;
            for (JsonNode row : day.getValue()) {
                if ("local".equals(row.path("cache").asText())) { localHits++; continue; }
                remote++;
                if (!row.path("promptTokens").isNumber() || !row.path("completionTokens").isNumber()) usageKnown=false;
                else { prompt+=row.path("promptTokens").asLong(); completion+=row.path("completionTokens").asLong(); }
                if (!row.path("cachedTokens").isNumber()) cacheKnown=false; else cached+=row.path("cachedTokens").asLong();
            }
            Map<String,Object> point = new LinkedHashMap<>(); point.put("date",day.getKey());
            point.put("promptTokens",usageKnown ? prompt : null); point.put("completionTokens",usageKnown ? completion : null);
            point.put("cachedTokens",usageKnown && cacheKnown ? cached : null); point.put("remoteCalls",remote); point.put("localHits",localHits);
            dailySeries.add(point);
        }
        Map<String,Object> result = new LinkedHashMap<>();
        result.put("rows",filtered.subList(start,Math.min(start+safeSize,filtered.size()))); result.put("total",filtered.size()); result.put("page",safePage); result.put("size",safeSize); result.put("summary",counts);
        result.put("providers",all.stream().map(row->row.path("provider").asText()).distinct().sorted().toList()); result.put("models",all.stream().map(row->row.path("model").asText()).distinct().sorted().toList());
        result.put("unreadableCount",unreadable); result.put("taskSeries",taskSeries); result.put("dailySeries",dailySeries); return result;
    }
}
