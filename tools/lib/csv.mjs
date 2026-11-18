/** RFC-style CSV records, including escaped quotes and embedded CR/LF. */
export function parseCsv(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false,
    closed = false;
  const pushField = () => {
    row.push(field);
    field = "";
    closed = false;
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
      continue;
    }
    if (char === '"') {
      if (field || closed) throw new Error("Unexpected CSV quote");
      quoted = true;
      continue;
    }
    if (char === ",") {
      pushField();
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      pushField();
      rows.push(row);
      row = [];
      continue;
    }
    if (closed) throw new Error("Characters after closing CSV quote");
    field += char;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (field || closed || row.length) {
    pushField();
    rows.push(row);
  }
  return rows;
}
