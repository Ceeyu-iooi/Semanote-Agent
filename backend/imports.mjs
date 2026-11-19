import { basename, extname } from "node:path";
import yauzl from "yauzl";
import { SaxesParser } from "saxes";
import { parseCsv } from "../tools/lib/csv.mjs";
import { ApiError } from "./data.mjs";

export const maxFileBytes = 5 * 1024 ** 2;
export const maxCsvBytes = 64 * 1024 ** 2;
export const maxCsvTexts = 50000;
const maxXmlBytes = 10 * 1024 ** 2;
const decoder = new TextDecoder("utf-8", { fatal: true });
const isBlank = (text) => /^[\s\u001c-\u001f]*$/u.test(text);
export function validateText(text) {
  if (isBlank(text)) throw new ApiError(400, "emptyText", "请输入非空白文本。");
  if (!text.isWellFormed() || text.includes("\0")) throw new ApiError(400, "invalidUnicode", "文本包含无效 Unicode 字符。");
  if (Array.from(text).length > 10000) throw new ApiError(413, "textTooLong", "单文本最多 10,000 个 Unicode 码点。");
}

async function docx(bytes) {
  return new Promise((resolve, reject) => {
    const invalid = () => new ApiError(400, "invalidDocx", "DOCX 正文无法读取，请检查文件或另存为 TXT。");
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(invalid());
      const fail = (failure = invalid()) => { zip.close(); reject(failure); };
      zip.on("error", () => fail());
      zip.on("end", () => reject(invalid()));
      if (zip.entryCount > 1000) return fail(new ApiError(413, "expandedFileTooLarge", "DOCX 条目过多。"));
      zip.on("entry", (entry) => {
        if (entry.fileName !== "word/document.xml") return zip.readEntry();
        if (entry.uncompressedSize > maxXmlBytes) return fail(new ApiError(413, "expandedFileTooLarge", "DOCX 正文解压后过大。"));
        zip.openReadStream(entry, async (streamError, stream) => {
          if (streamError) return fail();
          try {
            const parser = new SaxesParser({ xmlns: true });
            let text = "", reading = false, size = 0;
            parser.on("doctype", () => { throw invalid(); });
            parser.on("opentag", ({ local }) => {
              if (local === "t") reading = true;
              if (local === "tab") text += "\t";
              if (local === "br" || local === "cr") text += "\n";
            });
            parser.on("closetag", ({ local }) => {
              if (local === "t") reading = false;
              if (local === "p") text += "\n";
            });
            const append = (value) => { if (reading) text += value; };
            parser.on("text", append);
            parser.on("cdata", append);
            const xmlDecoder = new TextDecoder("utf-8", { fatal: true });
            for await (const chunk of stream) {
              size += chunk.length;
              if (size > maxXmlBytes) throw new ApiError(413, "expandedFileTooLarge", "DOCX 正文解压后过大。");
              parser.write(xmlDecoder.decode(chunk, { stream: true }));
            }
            parser.write(xmlDecoder.decode()).close();
            zip.close();
            resolve(text);
          } catch (failure) { fail(failure instanceof ApiError ? failure : invalid()); }
        });
      });
      zip.readEntry();
    });
  });
}

export async function parseImport(name, bytes) {
  const fileName = basename(name.replaceAll("\\", "/"));
  if (fileName.length > 255) throw new ApiError(400, "invalidFileName", "文件名过长。");
  const extension = extname(fileName).toLowerCase();
  if (![".csv", ".txt", ".md", ".docx"].includes(extension))
    throw new ApiError(400, "unsupportedFile", "请选择 DOCX、UTF-8 TXT、MD 或三列 CSV 文件。");
  const csv = extension === ".csv";
  if (bytes.length > (csv ? maxCsvBytes : maxFileBytes))
    throw new ApiError(413, "fileTooLarge", csv ? "CSV 文件超过 64 MiB。" : "文件超过 5 MiB。");
  let content;
  if (extension === ".docx") content = await docx(bytes);
  else {
    try { content = decoder.decode(bytes); }
    catch { throw new ApiError(400, "invalidEncoding", "请将文件另存为 UTF-8 后导入。"); }
  }
  let rows;
  try { rows = csv ? parseCsv(content) : [["text"], [content]]; }
  catch { throw new ApiError(400, "invalidCsv", "CSV 引号格式不正确。"); }
  const headers = rows[0];
  if (headers?.length !== (csv ? 3 : 1)) throw new ApiError(400, "invalidColumns", "CSV 首行必须包含三个列名。");
  const texts = [];
  let skippedCount = 0;
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index], rowNumber = csv ? index + 1 : 1;
    if (row.length !== headers.length) throw new ApiError(400, "invalidColumns", "CSV 第 " + rowNumber + " 条记录不是三列。");
    for (const [column, text] of row.entries()) {
      if (isBlank(text)) { skippedCount++; continue; }
      validateText(text);
      texts.push({ text, rowNumber, columnNumber: column + 1, columnName: headers[column] });
      if (texts.length > maxCsvTexts) throw new ApiError(413, "batchTooLarge", "每个 CSV 最多 50,000 份非空文本，请拆分后导入。");
    }
  }
  return { fileName, texts, skippedCount };
}
