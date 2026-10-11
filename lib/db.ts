import { Pool, type PoolClient } from "pg";

// ต่อ Supabase ผ่าน shared pooler แบบ transaction mode (port 6543) ดู docs/infra.md
// ข้อห้าม: อย่าใส่ `name` ใน query เพราะ transaction mode ไม่รองรับ prepared statement

declare global {
  var __pgPool: Pool | undefined;
}

function sslConfig(url: string) {
  const mode = process.env.DATABASE_SSL;
  const host = new URL(url).hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  if (mode === "disable" || (!mode && local)) return false;
  // ใส่ CA ของ Supabase (Database Settings > SSL) ใน DATABASE_CA เพื่อตรวจ certificate เต็มรูปแบบ
  const ca = process.env.DATABASE_CA;
  if (ca) return { ca, rejectUnauthorized: true };
  // ไม่มี CA: ยังเข้ารหัส แต่ไม่ตรวจว่าปลายทางเป็น Supabase จริง
  return { rejectUnauthorized: false };
}

export function getPool(): Pool {
  if (!globalThis.__pgPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalThis.__pgPool = new Pool({
      connectionString: url,
      ssl: sslConfig(url),
      max: Number(process.env.PG_POOL_MAX ?? 3),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
    });
  }
  return globalThis.__pgPool;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
