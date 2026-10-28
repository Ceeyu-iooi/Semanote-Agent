package io.semanote.service;

import io.semanote.api.ApiFailure;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.io.ByteArrayInputStream;
import java.util.zip.ZipInputStream;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;

/** Strict UTF-8 and RFC-style quoted CSV; fields retain original characters. */
public final class ImportParser {
    public record ImportedText(String text, int rowNumber, int columnNumber, String columnName) {}
    public record ImportResult(List<ImportedText> texts, int skippedCount) {}
    private ImportParser() {}

    public static ImportResult parse(String fileName, byte[] bytes) {
        if (bytes.length > 5 * 1024 * 1024) throw new ApiFailure(413, "fileTooLarge", "文件超过 5 MiB。");
        String content;
        String extension = fileName.toLowerCase(java.util.Locale.ROOT);
        try {
            content = extension.endsWith(".docx") ? docx(bytes) : StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException exception) { throw new ApiFailure(400, "invalidEncoding", "请将文件另存为 UTF-8 后导入。"); }
        if (content.startsWith("\uFEFF")) content = content.substring(1);
        List<ImportedText> texts = new ArrayList<>();
        int skippedCount = 0;
        if (extension.endsWith(".txt") || extension.endsWith(".md") || extension.endsWith(".docx")) {
            if (isBlank(content)) skippedCount++;
            else { validateText(content); texts.add(new ImportedText(content, 1, 1, "text")); }
        } else if (fileName.toLowerCase(java.util.Locale.ROOT).endsWith(".csv")) {
            List<List<String>> rows = csv(content);
            if (rows.isEmpty() || rows.getFirst().size() != 3) throw new ApiFailure(400, "invalidColumns", "CSV 首行必须包含三个列名。");
            List<String> headers = rows.getFirst();
            for (int index = 1; index < rows.size(); index++) {
                List<String> row = rows.get(index);
                if (row.size() != 3) throw new ApiFailure(400, "invalidColumns", "CSV 第 " + (index + 1) + " 条记录不是三列。");
                for (int column = 0; column < 3; column++) {
                    String text = row.get(column);
                    if (isBlank(text)) skippedCount++;
                    else { validateText(text); texts.add(new ImportedText(text, index + 1, column + 1, headers.get(column))); }
                    if (texts.size() > 500) throw new ApiFailure(413, "batchTooLarge", "单批最多 500 个非空白文本；本次未导入，请拆分文件。");
                }
            }
        } else throw new ApiFailure(400, "unsupportedFile", "请选择 DOCX、UTF-8 TXT、MD 或三列 CSV 文件。");
        return new ImportResult(texts, skippedCount);
    }

    private static String docx(byte[] bytes) {
        // Only main-document text is read; external relationships, macros and embedded objects are never opened.
        try (var zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            int expandedBytes = 0, entries = 0;
            for (var entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
                if (++entries > 1000) throw new ApiFailure(413, "expandedFileTooLarge", "DOCX 条目过多。");
                if (!"word/document.xml".equals(entry.getName())) {
                    expandedBytes += zip.readNBytes(10 * 1024 * 1024 + 1).length;
                    if (expandedBytes > 10 * 1024 * 1024) throw new ApiFailure(413, "expandedFileTooLarge", "DOCX 解压后过大。");
                    continue;
                }
                byte[] xml = zip.readNBytes(10 * 1024 * 1024 + 1);
                if (xml.length > 10 * 1024 * 1024) throw new ApiFailure(413, "expandedFileTooLarge", "DOCX 正文解压后过大。");
                XMLInputFactory factory = XMLInputFactory.newFactory();
                factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
                factory.setProperty("javax.xml.stream.isSupportingExternalEntities", false);
                factory.setXMLResolver((publicId, systemId, baseUri, namespace) -> { throw new javax.xml.stream.XMLStreamException("External resource rejected"); });
                var reader = factory.createXMLStreamReader(new ByteArrayInputStream(xml), "UTF-8");
                StringBuilder text = new StringBuilder();
                while (reader.hasNext()) {
                    int event = reader.next();
                    if (event == XMLStreamConstants.DTD) throw new IllegalArgumentException("DTD rejected");
                    if (event == XMLStreamConstants.START_ELEMENT) {
                        String name = reader.getLocalName();
                        if ("t".equals(name)) text.append(reader.getElementText());
                        else if ("tab".equals(name)) text.append('\t');
                        else if ("br".equals(name) || "cr".equals(name)) text.append('\n');
                    } else if (event == XMLStreamConstants.END_ELEMENT && "p".equals(reader.getLocalName())) text.append('\n');
                }
                reader.close();
                return text.toString();
            }
        } catch (ApiFailure failure) { throw failure; }
        catch (Exception exception) { throw new ApiFailure(400, "invalidDocx", "DOCX 正文无法读取，请检查文件或另存为 TXT。"); }
        throw new ApiFailure(400, "invalidDocx", "文件缺少 DOCX 正文。");
    }

    public static boolean isBlank(String text) {
        return text.codePoints().allMatch(codePoint -> Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint));
    }

    public static void validateText(String text) {
        if (isBlank(text)) throw new ApiFailure(400, "emptyText", "请输入非空白文本。");
        if (text.codePointCount(0, text.length()) > 10000) throw new ApiFailure(413, "textTooLong", "单文本最多 10,000 个 Unicode 码点。");
        // MySQL/UTF-8 cannot preserve unpaired UTF-16 surrogates. Reject, never normalize.
        for (int index = 0; index < text.length(); index++) {
            char character = text.charAt(index);
            if (Character.isHighSurrogate(character)) {
                if (index + 1 >= text.length() || !Character.isLowSurrogate(text.charAt(++index))) throw new ApiFailure(400, "invalidUnicode", "文本包含无效 Unicode 字符。");
            } else if (Character.isLowSurrogate(character) || character == 0) throw new ApiFailure(400, "invalidUnicode", "文本包含无效 Unicode 字符。");
        }
    }

    static List<List<String>> csv(String content) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false, closedQuote = false, fieldStarted = false;
        for (int index = 0; index < content.length(); index++) {
            char character = content.charAt(index);
            if (quoted) {
                if (character == '"') {
                    if (index + 1 < content.length() && content.charAt(index + 1) == '"') { field.append('"'); index++; }
                    else { quoted = false; closedQuote = true; }
                } else field.append(character);
            } else if (character == ',' || character == '\r' || character == '\n') {
                row.add(field.toString()); field.setLength(0); fieldStarted = false; closedQuote = false;
                if (character != ',') {
                    rows.add(row); row = new ArrayList<>();
                    if (character == '\r' && index + 1 < content.length() && content.charAt(index + 1) == '\n') index++;
                }
            } else if (character == '"' && !fieldStarted) { quoted = true; fieldStarted = true; }
            else {
                if (closedQuote || character == '"') throw new ApiFailure(400, "invalidCsv", "CSV 引号格式不正确。");
                field.append(character); fieldStarted = true;
            }
        }
        if (quoted) throw new ApiFailure(400, "invalidCsv", "CSV 存在未闭合引号。");
        if (fieldStarted || closedQuote || !row.isEmpty()) { row.add(field.toString()); rows.add(row); }
        return rows;
    }
}
