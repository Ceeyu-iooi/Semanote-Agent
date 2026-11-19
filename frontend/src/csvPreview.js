import { parseCsv } from "../../tools/lib/csv.mjs";

// Count original, nonblank cells off the UI thread. The server independently validates the upload.
self.addEventListener("message", async ({ data: file }) => {
  try {
    if (file.size > 64 * 1024 ** 2) throw new Error("CSV 文件超过 64 MiB。");
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
    catch { throw new Error("请将文件另存为 UTF-8 后导入。"); }
    let rows;
    try { rows = parseCsv(text); }
    catch { throw new Error("CSV 引号格式不正确。"); }
    if (!rows.length || rows[0].length !== 3) throw new Error("CSV 首行必须包含三个列名。");
    let count = 0;
    for (let index = 1; index < rows.length; index++) {
      if (rows[index].length !== 3) throw new Error("CSV 第 " + (index + 1) + " 条记录不是三列。");
      for (const cell of rows[index]) if (!/^[\s\u001c-\u001f]*$/u.test(cell)) count++;
      if (count > 50000) throw new Error("每个 CSV 最多 50,000 份非空文本，请拆分后导入。");
    }
    self.postMessage({ count });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
});
