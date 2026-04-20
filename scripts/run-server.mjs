import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const isRenderRuntime = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
const serverEntry = path.resolve('server/index.js');
const nodeArgs = [];
const env = { ...process.env };

function normalizeBoolean(value, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function isLocalPostgresHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost';
}

function shouldPrepareLocalPostgres() {
  if (isRenderRuntime) {
    return false;
  }

  if (!normalizeBoolean(env.AUTO_START_LOCAL_POSTGRES, true)) {
    return false;
  }

  return isLocalPostgresHost(env.PGHOST);
}

async function canConnectToPostgres() {
  const { Client } = await import('pg');
  const client = new Client({
    host: env.PGHOST,
    port: Number(env.PGPORT || 5432),
    database: env.PGDATABASE,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    ssl: env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: Number(env.PG_CONNECTION_TIMEOUT_MS || 2000),
  });

  try {
    await client.connect();
    await client.query('select 1');
    return true;
  } catch (_error) {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

function startLocalPostgresContainer() {
  const result = spawnSync('docker', ['compose', 'up', '-d', 'postgres'], {
    stdio: 'inherit',
    env,
  });

  if (result.status !== 0) {
    throw new Error('Docker Compose no pudo iniciar el servicio postgres local.');
  }
}

async function waitForLocalPostgres(timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await canConnectToPostgres()) {
      return;
    }

    await delay(1_000);
  }

  throw new Error(
    `PostgreSQL local no estuvo listo a tiempo en ${env.PGHOST || '127.0.0.1'}:${env.PGPORT || 5432}.`,
  );
}

async function prepareLocalPostgres() {
  if (!shouldPrepareLocalPostgres()) {
    return;
  }

  if (await canConnectToPostgres()) {
    console.log(`PostgreSQL local disponible en ${env.PGHOST}:${env.PGPORT || 5432}`);
    return;
  }

  console.log(`PostgreSQL local no responde en ${env.PGHOST}:${env.PGPORT || 5432}. Iniciando Docker...`);
  startLocalPostgresContainer();
  await waitForLocalPostgres();
  console.log(`PostgreSQL local listo en ${env.PGHOST}:${env.PGPORT || 5432}`);
}

if (isRenderRuntime) {
  env.NODE_ENV = env.NODE_ENV || 'production';
} else {
  nodeArgs.push('--watch-path=server');

  if (existsSync(path.resolve('.env'))) {
    nodeArgs.push('--watch-path=.env');
  }
}

nodeArgs.push(serverEntry);

try {
  await prepareLocalPostgres();
} catch (error) {
  console.error('No se pudo preparar PostgreSQL local:', error);
  process.exit(1);
}

const child = spawn(process.execPath, nodeArgs, {
  stdio: 'inherit',
  env,
});

child.on('error', (error) => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
