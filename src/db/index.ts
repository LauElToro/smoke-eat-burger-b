import mysql, {
  Pool,
  PoolConnection,
  RowDataPacket,
  ResultSetHeader,
} from "mysql2/promise";
import { config } from "../config";

export const pool: Pool = mysql.createPool({
  host: config.mysql.host,
  port: config.mysql.port,
  user: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  waitForConnections: true,
  connectionLimit: 10,
  ssl: config.mysql.useSSL ? { rejectUnauthorized: true } : undefined,
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