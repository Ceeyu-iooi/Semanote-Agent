package io.semanote.service;

import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;
import java.util.zip.ZipOutputStream;
import java.util.zip.ZipEntry;
import io.semanote.api.ApiFailure;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DocumentImportTest {
    private byte[] document(String xml) throws Exception {
        var bytes=new ByteArrayOutputStream();
        try(var zip=new ZipOutputStream(bytes)){zip.putNextEntry(new ZipEntry("word/document.xml"));zip.write(xml.getBytes(StandardCharsets.UTF_8));zip.closeEntry();}
        return bytes.toByteArray();
    }
    @Test void markdownRetainsExactSource() {
        String text="# 原创标题\n\n小林在阅读。🙂\n";
        assertEquals(text,ImportParser.parse("example.md",text.getBytes(StandardCharsets.UTF_8)).texts().getFirst().text());
    }
    @Test void docxExtractsMainBodyParagraphsAndTabs() throws Exception {
        byte[] bytes=document("<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>小林</w:t><w:tab/><w:t>阅读🙂</w:t><w:br/><w:t>第二行</w:t></w:r></w:p></w:body></w:document>");
        assertEquals("小林\t阅读🙂\n第二行\n",ImportParser.parse("sample.docx",bytes).texts().getFirst().text());
    }
    @Test void docxCannotLoadExternalEntitiesOrAcceptInvalidZip() throws Exception {
        byte[] bytes=document("<!DOCTYPE x [<!ENTITY remote SYSTEM 'file:///not-a-real-private-file'>]><w:document xmlns:w=\"urn:test\"><w:p><w:t>&remote;</w:t></w:p></w:document>");
        assertThrows(ApiFailure.class,()->ImportParser.parse("unsafe.docx",bytes));
        assertThrows(ApiFailure.class,()->ImportParser.parse("invalid.docx","not zip".getBytes(StandardCharsets.UTF_8)));
    }
}
