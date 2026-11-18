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
        assertThrows(ApiFailure.class, () -> ImportParser.validateText("\uD800"));
    }

    @Test void parsesTrainingSizedCsvWithoutCombiningCells() {
        String text = "原创示例".repeat(150);
        String csv = "\uFEFFA,B,C\n" + (text + "," + text + "," + text + "\n").repeat(5102);
        byte[] bytes = csv.getBytes(StandardCharsets.UTF_8);
        assertTrue(bytes.length > ImportParser.MAX_FILE_BYTES);
        var result = ImportParser.parse("synthetic.csv", bytes);
        assertEquals(15306, result.texts().size());
        assertEquals(5103, result.texts().getLast().rowNumber());
        assertEquals(3, result.texts().getLast().columnNumber());
        assertEquals(text, result.texts().getLast().text());
        assertThrows(ApiFailure.class, () -> ImportParser.parse("overflow.csv",
                ("A,B,C\n" + "a,b,c\n".repeat(16667)).getBytes(StandardCharsets.UTF_8)));
    }
}
