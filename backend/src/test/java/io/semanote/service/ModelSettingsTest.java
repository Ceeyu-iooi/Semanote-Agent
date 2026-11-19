package io.semanote.service;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.*;
class ModelSettingsTest {
 @TempDir Path root;
 final ObjectMapper mapper=new ObjectMapper();
 @Test void keyIsMaskedAndRetainedUntilExplicitChange() throws Exception {
  var service=new ModelSettingsService(mapper,root.toString());var settings=service.read();var provider=(com.fasterxml.jackson.databind.node.ObjectNode)settings.path("providers").get(0);provider.put("apiKey","fixture-only");
  var saved=service.save(settings);assertFalse(saved.toString().contains("fixture-only"));assertTrue(saved.path("providers").get(0).path("hasApiKey").asBoolean());service.save(saved);assertEquals("fixture-only",service.executionConfig("deepseek").path("apiKey").asText());
 }
 @Test void endpointChangeCannotBorrowExistingSecret() throws Exception {
  var service=new ModelSettingsService(mapper,root.toString());var settings=service.read();((com.fasterxml.jackson.databind.node.ObjectNode)settings.path("providers").get(0)).put("apiKey","fixture-only");var saved=service.save(settings);((com.fasterxml.jackson.databind.node.ObjectNode)saved.path("providers").get(0)).put("baseUrl","https://different.example/v1");assertThrows(io.semanote.api.ApiFailure.class,()->service.save(saved));
 }
 @Test void customProviderCanBeAddedAndSelected() throws Exception {
  var service=new ModelSettingsService(mapper,root.toString());var settings=(com.fasterxml.jackson.databind.node.ObjectNode)service.read();settings.put("provider","custom");((com.fasterxml.jackson.databind.node.ArrayNode)settings.path("providers")).addObject().put("id","custom").put("name","自定义").put("baseUrl","https://example.org/v1").put("model","model").put("apiKey","fixture-only").put("timeoutSeconds",120).put("maxOutputTokens",8192);assertEquals("custom",service.save(settings).path("provider").asText());
 }
}
