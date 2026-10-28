package io.semanote.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.semanote.api.ApiFailure;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Public model preferences only; credentials stay in the original local environment. */
@Service
public class ModelSettingsService {
    private final ObjectMapper mapper;
    private final Path file;
    public ModelSettingsService(ObjectMapper mapper,@Value("${semanote.project-root}") String root) { this.mapper=mapper;this.file=Path.of(root).resolve("profile/runtime/model-preferences.json"); }
    public synchronized Object read() {
        try { return Files.exists(file)?mapper.readTree(Files.readAllBytes(file)):Map.of("provider","deepseek","model","","timeoutSeconds",90); }
        catch(Exception exception){throw new ApiFailure(500,"settingsUnavailable","模型设置无法读取。");}
    }
    public synchronized Object save(JsonNode body) {
        String provider=body.path("provider").asText(),model=body.path("model").asText();
        int timeout=body.path("timeoutSeconds").asInt();
        if(!provider.matches("[a-z][a-z0-9_]{0,39}")||(!model.isEmpty()&&!model.matches("[A-Za-z0-9_.:/-]{1,120}"))||timeout<10||timeout>240)throw new ApiFailure(400,"invalidModelSettings","请检查供应商、模型名称与超时（10–240秒）。");
        try {
            Files.createDirectories(file.getParent());Path temporary=file.resolveSibling("model-preferences.json.tmp");
            mapper.writeValue(temporary.toFile(),Map.of("provider",provider,"model",model,"timeoutSeconds",timeout));
            Files.move(temporary,file,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);
            return read();
        }catch(Exception exception){throw new ApiFailure(500,"settingsUnavailable","模型设置未保存，请重试。");}
    }
}
