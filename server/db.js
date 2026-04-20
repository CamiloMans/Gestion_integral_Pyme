import 'dotenv/config';
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

const { Pool } = pg;
const requestContextStorage = new AsyncLocalStorage();

function createSslConfig() {
  if (process.env.PGSSLMODE !== 'require') {
    return false;
  }

  return {
    rejectUnauthorized: false,
  };
}

function readTimeout(name, fallback) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: createSslConfig(),
  connectionTimeoutMillis: readTimeout('PG_CONNECTION_TIMEOUT_MS', 5000),
});

let tenantCache = null;

export async function query(text, params = []) {
  return pool.query(text, params);
}

export function runWithRequestContext(context, callback) {
  return requestContextStorage.run(context, callback);
}

export function getRequestContext() {
  return requestContextStorage.getStore() || null;
}

export function mergeRequestContext(partialContext) {
  const requestContext = requestContextStorage.getStore();

  if (!requestContext) {
    return null;
  }

  Object.assign(requestContext, partialContext);
  return requestContext;
}

export async function getTenant() {
  const requestContext = getRequestContext();

  if (requestContext?.tenant) {
    return requestContext.tenant;
  }

  if (tenantCache) {
    return tenantCache;
  }

  if (process.env.PG_TENANT_ID) {
    const tenantResult = await query(
      `
        select id, slug, nombre
        from tenants
        where id = $1
        limit 1
      `,
      [process.env.PG_TENANT_ID],
    );

    if (tenantResult.rows[0]) {
      tenantCache = tenantResult.rows[0];
      return tenantCache;
    }
  }

  if (process.env.PG_TENANT_SLUG) {
    const tenantResult = await query(
      `
        select id, slug, nombre
        from tenants
        where slug = $1
        limit 1
      `,
      [process.env.PG_TENANT_SLUG],
    );

    if (tenantResult.rows[0]) {
      tenantCache = tenantResult.rows[0];
      return tenantCache;
    }
  }

  const tenantResult = await query(
    `
      select id, slug, nombre
      from tenants
      where estado = 'activo'
      order by created_at asc
      limit 1
    `,
  );

  if (!tenantResult.rows[0]) {
    throw new Error('No se encontro un tenant activo en la base de datos');
  }

  tenantCache = tenantResult.rows[0];
  return tenantCache;
}

export async function closePool() {
  await pool.end();
}
