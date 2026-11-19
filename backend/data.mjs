import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { status, code });
  }
}
export const now = () => new Date().toISOString();

export async function openDatabase(env) {
  const url = new URL((env.SEMANOTE_DB_URL || "mysql://127.0.0.1:3307/semanote").replace(/^jdbc:/, ""));
  const pool = mysql.createPool({
    host: url.hostname, port: Number(url.port || 3306), database: decodeURIComponent(url.pathname.slice(1)),
    user: env.SEMANOTE_DB_USER || "semanote", password: env.SEMANOTE_DB_PASSWORD,
    charset: "utf8mb4_unicode_ci", jsonStrings: true, connectionLimit: 5,
    supportBigNumbers: true,
  });
  const makeQuery = (connection) => async (sql, ...values) => {
    if (!values.length) return (await connection.query(sql))[0];
    return (await connection.execute(sql, values))[0];
  };
  const query = makeQuery(pool);
  try {
    const schema = await readFile(new URL("./src/main/resources/schema.sql", import.meta.url), "utf8");
    for (const statement of schema.split(";").filter((part) => part.trim())) await query(statement);
  } catch (error) {
    await pool.end();
    throw error;
  }
  return {
    query, close: () => pool.end(),
    async transaction(action) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const result = await action(makeQuery(connection));
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
  };
}

export async function one(query, sql, ...values) {
  const [row] = await query(sql, ...values);
  if (!row) throw new ApiError(404, "notFound", "所选内容不存在，请刷新列表。");
  return row;
}

export function parseStored(value) {
  try { return value == null ? null : JSON.parse(value); }
  catch { throw new ApiError(500, "invalidStoredData", "已保存数据无法读取，请检查备份。"); }
}
