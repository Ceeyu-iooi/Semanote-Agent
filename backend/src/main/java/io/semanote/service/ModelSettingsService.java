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

/** Local provider registry; read APIs never return credentials. */
@Service
public class ModelSettingsService {
    private final ObjectMapper mapper;
    private final Path file;
    public ModelSettingsService(ObjectMapper mapper,@Value("${semanote.project-root}") String root) { this.mapper=mapper;this.file=Path.of(root).resolve("profile/runtime/model-providers.json"); }
    private com.fasterxml.jackson.databind.node.ObjectNode stored() throws Exception {
        if(Files.exists(file))return (com.fasterxml.jackson.databind.node.ObjectNode)mapper.readTree(Files.readAllBytes(file));
        var data=mapper.createObjectNode();data.put("provider","deepseek");var providers=data.putArray("providers");
        providers.addObject().put("id","deepseek").put("name","DeepSeek").put("baseUrl","https://api.deepseek.com").put("model","deepseek-flash").put("apiKey",System.getenv().getOrDefault("DEEPSEEK_API_KEY", "")).put("timeoutSeconds",120).put("maxOutputTokens",8192).put("jsonMode",true);
        providers.addObject().put("id","aliyun").put("name","阿里云百炼").put("baseUrl","https://dashscope.aliyuncs.com/compatible-mode/v1").put("model","deepseek-v4.1-flash").put("apiKey","").put("timeoutSeconds",120).put("maxOutputTokens",8192).put("jsonMode",true);return data;
    }
    public synchronized JsonNode read() {
        try {var data=stored().deepCopy();for(JsonNode provider:data.path("providers")){var item=(com.fasterxml.jackson.databind.node.ObjectNode)provider;item.put("hasApiKey",!item.path("apiKey").asText().isBlank());item.remove("apiKey");}return data;}
        catch(Exception exception){throw new ApiFailure(500,"settingsUnavailable","模型设置无法读取。");}
    }
    public synchronized JsonNode executionConfig(String provider) {
        try {for(JsonNode item:stored().path("providers"))if(provider.equals(item.path("id").asText())){if(item.path("apiKey").asText().isBlank())throw new ApiFailure(400,"missingApiKey","请先在设置中填写该供应商密钥。");return item.deepCopy();}throw new ApiFailure(400,"unknownProvider","请先在设置中添加该供应商。");}
        catch(ApiFailure failure){throw failure;}catch(Exception exception){throw new ApiFailure(500,"settingsUnavailable","模型设置无法读取。");}
    }
    public synchronized JsonNode save(JsonNode body) {
        try {
            if(!body.path("providers").isArray()||body.path("providers").isEmpty()||body.path("providers").size()>20)invalid();
            var ids=new java.util.HashSet<String>();var next=mapper.createObjectNode();next.put("provider",body.path("provider").asText());var providers=next.putArray("providers");JsonNode previous=stored();
            for(JsonNode value:body.path("providers")){
                String id=value.path("id").asText(),name=value.path("name").asText(),base=value.path("baseUrl").asText(),model=value.path("model").asText();var url=java.net.URI.create(base);
                if(!id.matches("[a-z][a-z0-9_]{0,39}")||!ids.add(id)||name.isBlank()||name.length()>80||!"https".equals(url.getScheme())||url.getHost()==null||url.getUserInfo()!=null||url.getQuery()!=null||url.getFragment()!=null||base.length()>500||!model.matches("[A-Za-z0-9_.:/-]{1,120}"))invalid();
                int timeout=value.path("timeoutSeconds").asInt(),tokens=value.path("maxOutputTokens").asInt();if(timeout<10||timeout>240||tokens<512||tokens>32768)invalid();String key=value.path("apiKey").asText("");
                if(key.isBlank())for(JsonNode old:previous.path("providers"))if(id.equals(old.path("id").asText())){if(!base.equals(old.path("baseUrl").asText())&&!old.path("apiKey").asText().isBlank())throw new ApiFailure(400,"keyRequiredForNewEndpoint","修改供应商地址时，请重新填写此地址的密钥。");key=old.path("apiKey").asText();}
                if(key.length()>1000||key.matches("(?s).*\\s.*"))invalid();
                providers.addObject().put("id",id).put("name",name).put("baseUrl",base.replaceAll("/+$", "")).put("model",model).put("apiKey",key).put("timeoutSeconds",timeout).put("maxOutputTokens",tokens).put("jsonMode",value.path("jsonMode").asBoolean(true));
            }
            if(!ids.contains(next.path("provider").asText()))invalid();Files.createDirectories(file.getParent());Path temporary=file.resolveSibling("model-providers.json.tmp");mapper.writeValue(temporary.toFile(),next);Files.move(temporary,file,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);return read();
        }catch(ApiFailure failure){throw failure;}catch(IllegalArgumentException exception){invalid();return null;}catch(Exception exception){throw new ApiFailure(500,"settingsUnavailable","模型设置未保存，请重试。");}
    }
    private static void invalid(){throw new ApiFailure(400,"invalidModelSettings","请检查供应商身份、HTTPS地址、模型和超时/token上限。");}
}
