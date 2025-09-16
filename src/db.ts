import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";

export const pool: Pool = mysql.createPool({
  host: process.env.MYSQL_HOST!,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER!,
  password: process.env.MYSQL_PASSWORD!,
  database: process.env.MYSQL_DATABASE!,
  waitForConnections: true,
  connectionLimit: 10,
  ssl: String(process.env.MYSQL_USE_SSL || "").toLowerCase() === "true" ? { rejectUnauthorized: true } : undefined
});

export async function q<T extends RowDataPacket[] | ResultSetHeader>(
  sql: string,
  params?: any[]
): Promise<[T, any]> {
  return pool.query<T>(sql, params);
}

export async function getConn(): Promise<PoolConnection> {
  return pool.getConnection();
}