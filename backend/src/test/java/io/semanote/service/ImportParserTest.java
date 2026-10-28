package io.semanote.service;

import io.semanote.api.ApiFailure;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ImportParserTest {
    @Test void preservesQuotedNewlinesWhitespaceDuplicatesAndSource() {
        var result = ImportParser.parse("example.csv", "\uFEFFA,B,C\r\n\" 小林\r\n学习 \" ,x,x\r\n".replace("\" ,", "\",").getBytes(StandardCharsets.UTF_8));
        assertEquals(3, result.texts().size());
        assertEquals(" 小林\r\n学习 ", result.texts().getFirst().text());
        assertEquals(2, result.texts().getFirst().rowNumber());
        assertEquals(3, result.texts().get(2).columnNumber());
        assertEquals("x", result.texts().get(2).text());
    }
    @Test void skipsOnlyBlankAndRejectsBrokenEncodingAndColumns() {
        assertEquals(3, ImportParser.parse("empty.csv", "A,B,C\n ,\t,\n".getBytes(StandardCharsets.UTF_8)).skippedCount());
        assertThrows(ApiFailure.class, () -> ImportParser.parse("bad.txt", new byte[]{(byte) 0xff}));
        assertThrows(ApiFailure.class, () -> ImportParser.parse("bad.csv", "A,B,C\na,b\n".getBytes(StandardCharsets.UTF_8)));
        assertThrows(ApiFailure.class, () -> ImportParser.parse("bad.csv", "A,B,C\n\"open,b,c".getBytes(StandardCharsets.UTF_8)));
    }
    @Test void limitsCountCodePointsAndNeverTruncate() {
        ImportParser.validateText("😀".repeat(10000));
        assertThrows(ApiFailure.class, () -> ImportParser.validateText("😀".repeat(10001)));
        assertThrows(ApiFailure.class, () -> ImportParser.parse("many.csv", ("A,B,C\n" + "a,b,c\n".repeat(167)).getBytes(StandardCharsets.UTF_8)));
        assertThrows(ApiFailure.class, () -> ImportParser.validateText("\uD800"));
    }
}
