package io.semanote.data;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import io.semanote.api.ApiFailure;

/** Parameterized persistence; all business transactions are owned by the service. */
@Repository
public class WorkspaceRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public WorkspaceRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public JdbcTemplate jdbc() { return jdbc; }

    public Map<String, Object> one(String sql, Object... parameters) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, parameters);
        if (rows.isEmpty()) throw new ApiFailure(404, "notFound", "所选内容不存在，请刷新列表。");
        return rows.getFirst();
    }

    public JsonNode parse(Object value) {
        if (value == null) return mapper.nullNode();
        try { return mapper.readTree(value.toString()); }
        catch (JsonProcessingException exception) { throw new ApiFailure(500, "invalidStoredData", "已保存数据无法读取，请检查备份。"); }
    }

    public String json(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (JsonProcessingException exception) { throw new ApiFailure(400, "invalidJson", "数据无法转换为 JSON。"); }
    }
}
