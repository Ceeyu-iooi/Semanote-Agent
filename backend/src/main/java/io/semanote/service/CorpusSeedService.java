package io.semanote.service;

import io.semanote.data.WorkspaceRepository;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

/** Local course corpus only: idempotent exact dedup, all original row/column occurrences retained. */
@Service
@org.springframework.boot.sql.init.dependency.DependsOnDatabaseInitialization
public class CorpusSeedService {
    private final WorkspaceRepository repository;
    private final TransactionTemplate transaction;
    private final Path root;
    private final boolean enabled;
    public CorpusSeedService(WorkspaceRepository repository, PlatformTransactionManager manager, @Value("${semanote.project-root}") String root, @Value("${semanote.seed-corpus:true}") boolean enabled) {
        this.repository=repository; this.transaction=new TransactionTemplate(manager); this.root=Path.of(root); this.enabled=enabled;
    }
    @PostConstruct
    public void seed() {
        Path source = root.resolve("profile/data/train.csv");
        if (!enabled || !Files.isRegularFile(source)) return;
        try {
            String content = Files.readString(source, StandardCharsets.UTF_8);
            if (content.startsWith("\uFEFF")) content=content.substring(1);
            List<List<String>> rows=ImportParser.csv(content);
            if (rows.isEmpty() || rows.getFirst().size()!=3) throw new IllegalArgumentException("Corpus structure changed");
            Map<String,List<Map<String,Object>>> occurrences=new LinkedHashMap<>();
            for (int row=1;row<rows.size();row++) {
                if (rows.get(row).size()!=3) throw new IllegalArgumentException("Corpus structure changed");
                for (int column=0;column<3;column++) {
                    String text=rows.get(row).get(column); if (ImportParser.isBlank(text)) continue;
                    ImportParser.validateText(text);
                    occurrences.computeIfAbsent(text,key->new ArrayList<>()).add(Map.of("rowNumber",row+1,"columnNumber",column+1,"columnName",rows.getFirst().get(column)));
                }
            }
            transaction.executeWithoutResult(status -> {
                int index=0;
                for (var entry:occurrences.entrySet()) {
                    index++;
                    String id=UUID.nameUUIDFromBytes(("semanote-corpus:"+entry.getKey()).getBytes(StandardCharsets.UTF_8)).toString();
                    if (repository.jdbc().queryForObject("SELECT COUNT(*) FROM textDocument WHERE id=?",Integer.class,id)>0) continue;
                    String revisionId=UUID.nameUUIDFromBytes((id+":1").getBytes(StandardCharsets.UTF_8)).toString();
                    String timestamp=WorkspaceService.now();
                    String hash;
                    try { hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(entry.getKey().getBytes(StandardCharsets.UTF_8))); }
                    catch (Exception exception) { throw new IllegalStateException(exception); }
                    Map<String,Object> provenance=Map.of("kind","corpus","fileName","train.csv","sourceCount",entry.getValue().size(),"occurrences",entry.getValue());
                    repository.jdbc().update("INSERT INTO textDocument(id,title,currentRevisionId,sourceJson,createdAt,updatedAt) VALUES (?,?,?,?,?,?)",id,"语料 · "+String.format("%04d",index),revisionId,repository.json(provenance),timestamp,timestamp);
                    repository.jdbc().update("INSERT INTO textRevision(id,documentId,revisionNumber,textBody,textHash,createdAt) VALUES (?,?,1,?,?,?)",revisionId,id,entry.getKey(),hash,timestamp);
                }
            });
        } catch (Exception exception) { throw new IllegalStateException("Local corpus initialization failed; original file and existing documents preserved",exception); }
    }
}
