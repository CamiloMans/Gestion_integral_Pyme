import { randomUUID } from 'node:crypto';
import { query } from './db.js';

const isProduction = process.env.NODE_ENV === 'production';
const DEFAULT_DEV_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const DEFAULT_DEV_USER_ID = '00000000-0000-4000-8000-000000000002';
const DEFAULT_DEV_MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000003';

let coreSchemaPromise = null;
let devSeedPromise = null;

function normalizeBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function normalizeText(value, fallback) {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

const devAuthBypassEnabled = !isProduction && normalizeBoolean(process.env.DEV_AUTH_BYPASS);

export function isDevAuthBypassEnabled() {
  return devAuthBypassEnabled;
}

export function getDevAuthBypassDetails() {
  return {
    tenantId: normalizeText(process.env.DEV_AUTH_TENANT_ID, DEFAULT_DEV_TENANT_ID),
    tenantSlug: normalizeText(process.env.DEV_AUTH_TENANT_SLUG, 'rekosol-local'),
    tenantName: normalizeText(process.env.DEV_AUTH_TENANT_NAME, 'Rekosol Local'),
    userId: normalizeText(process.env.DEV_AUTH_USER_ID, DEFAULT_DEV_USER_ID),
    membershipId: normalizeText(process.env.DEV_AUTH_MEMBERSHIP_ID, DEFAULT_DEV_MEMBERSHIP_ID),
    userEmail: normalizeText(process.env.DEV_AUTH_BYPASS_EMAIL, 'dev@rekosol.local').toLowerCase(),
    userName: normalizeText(process.env.DEV_AUTH_BYPASS_NAME, 'Usuario Local'),
    role: normalizeText(process.env.DEV_AUTH_BYPASS_ROLE, 'admin').toLowerCase() === 'member'
      ? 'member'
      : 'admin',
  };
}

export async function ensureCoreSchema() {
  if (coreSchemaPromise) {
    return coreSchemaPromise;
  }

  coreSchemaPromise = (async () => {
    await query(`
      create table if not exists tenants (
        id uuid primary key,
        slug character varying not null unique,
        nombre character varying not null,
        estado character varying not null default 'activo',
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now()
      )
    `);

    await query(`
      create table if not exists users (
        id uuid primary key,
        email character varying not null unique,
        nombre character varying,
        auth_provider character varying,
        auth_subject character varying,
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now()
      )
    `);

    await query(`
      create table if not exists tenant_memberships (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        rol character varying not null default 'member',
        estado character varying not null default 'activo',
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now(),
        unique (tenant_id, user_id)
      )
    `);

    await query(`
      create index if not exists idx_tenant_memberships_user_estado
      on tenant_memberships (user_id, estado)
    `);

    await query(`
      create table if not exists dim_empresa (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        razon_social character varying not null,
        rut character varying,
        numero_contacto character varying,
        correo_electronico character varying,
        categoria character varying,
        activo boolean not null default true,
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now()
      )
    `);

    await query(`
      create index if not exists idx_dim_empresa_tenant_created_at
      on dim_empresa (tenant_id, created_at desc)
    `);

    await query(`
      create table if not exists dim_proyecto (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        nombre character varying not null,
        codigo_proyecto character varying,
        monto_total_proyecto numeric,
        moneda_base character varying(3),
        activo boolean not null default true,
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now()
      )
    `);

    await query(`
      create index if not exists idx_dim_proyecto_tenant_created_at
      on dim_proyecto (tenant_id, created_at desc)
    `);

    await query(`
      create table if not exists dim_categoria (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        nombre character varying not null,
        color character varying,
        activa boolean not null default true,
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now()
      )
    `);

    await query(`
      create index if not exists idx_dim_categoria_tenant_created_at
      on dim_categoria (tenant_id, created_at desc)
    `);

    await query(`
      create table if not exists dim_tipo_documento (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        nombre character varying not null,
        descripcion text,
        activo boolean not null default true,
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now()
      )
    `);

    await query(`
      create index if not exists idx_dim_tipo_documento_tenant_created_at
      on dim_tipo_documento (tenant_id, created_at desc)
    `);

    await query(`
      create table if not exists dim_tipo_documento_proyecto (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        nombre character varying not null,
        descripcion text,
        activo boolean not null default true,
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now()
      )
    `);

    await query(`
      create index if not exists idx_dim_tipo_documento_proyecto_tenant_created_at
      on dim_tipo_documento_proyecto (tenant_id, created_at desc)
    `);

    await query(`
      create table if not exists dim_colaborador (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        nombre character varying not null,
        email character varying,
        telefono character varying,
        cargo character varying,
        activo boolean not null default true,
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now()
      )
    `);

    await query(`
      create index if not exists idx_dim_colaborador_tenant_created_at
      on dim_colaborador (tenant_id, created_at desc)
    `);

    await query(`
      create table if not exists fct_gasto (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        fecha date not null,
        empresa_id uuid not null references dim_empresa(id) on delete restrict,
        categoria_id uuid references dim_categoria(id) on delete set null,
        tipo_documento_id uuid references dim_tipo_documento(id) on delete set null,
        numero_documento character varying not null default '',
        monto_neto numeric,
        iva numeric,
        monto_total numeric not null,
        detalle text,
        proyecto_id uuid references dim_proyecto(id) on delete set null,
        colaborador_id uuid references dim_colaborador(id) on delete set null,
        comentario_tipo_documento text,
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now()
      )
    `);

    await query(`
      create index if not exists idx_fct_gasto_tenant_fecha
      on fct_gasto (tenant_id, fecha desc, created_at desc)
    `);

    await query(`
      create index if not exists idx_fct_gasto_tenant_empresa
      on fct_gasto (tenant_id, empresa_id)
    `);

    await query(`
      create index if not exists idx_fct_gasto_tenant_proyecto
      on fct_gasto (tenant_id, proyecto_id)
    `);
  })().catch((error) => {
    coreSchemaPromise = null;
    throw error;
  });

  return coreSchemaPromise;
}

export async function ensureDevSeedData() {
  if (!devAuthBypassEnabled) {
    return null;
  }

  if (devSeedPromise) {
    return devSeedPromise;
  }

  devSeedPromise = (async () => {
    await ensureCoreSchema();

    const details = getDevAuthBypassDetails();

    await query(
      `
        insert into tenants (
          id,
          slug,
          nombre,
          estado,
          created_at,
          updated_at
        )
        values ($1, $2, $3, 'activo', now(), now())
        on conflict (id)
        do update set
          slug = excluded.slug,
          nombre = excluded.nombre,
          estado = 'activo',
          updated_at = now()
      `,
      [details.tenantId, details.tenantSlug, details.tenantName],
    );

    const userResult = await query(
      `
        insert into users (
          id,
          email,
          nombre,
          created_at,
          updated_at
        )
        values ($1, $2, $3, now(), now())
        on conflict (email)
        do update set
          nombre = excluded.nombre,
          updated_at = now()
        returning id
      `,
      [details.userId, details.userEmail, details.userName],
    );

    const resolvedUserId = userResult.rows[0]?.id || details.userId || randomUUID();

    await query(
      `
        insert into tenant_memberships (
          id,
          tenant_id,
          user_id,
          rol,
          estado,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, 'activo', now(), now())
        on conflict (tenant_id, user_id)
        do update set
          rol = excluded.rol,
          estado = 'activo',
          updated_at = now()
      `,
      [details.membershipId, details.tenantId, resolvedUserId, details.role],
    );

    return {
      ...details,
      userId: resolvedUserId,
    };
  })().catch((error) => {
    devSeedPromise = null;
    throw error;
  });

  return devSeedPromise;
}
