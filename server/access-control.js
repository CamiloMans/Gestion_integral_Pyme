import { ALL_PERMISSIONS, LEGACY_MEMBER_PERMISSIONS, getEffectivePermissions, normalizePermissionKeys } from '../shared/access-control.js';
import { pool, query } from './db.js';

const ACCESS_MIGRATION_KEY = '2026-08-17-membership-view-permissions-v1';
let accessControlSchemaPromise = null;

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

export function isSuperAdmin(role) {
  return normalizeRole(role) === 'super_admin';
}

export function validatePermissionKeys(values) {
  const submitted = Array.isArray(values) ? values : [];
  const normalized = normalizePermissionKeys(submitted);
  if (normalized.length !== new Set(submitted).size || submitted.some((permission) => !ALL_PERMISSIONS.includes(permission))) {
    const error = new Error('La selección contiene uno o más permisos desconocidos.');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

export async function ensureAccessControlSchema() {
  if (accessControlSchemaPromise) return accessControlSchemaPromise;

  accessControlSchemaPromise = (async () => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("select pg_advisory_xact_lock(hashtext('rekosol-access-control-v1'))");
      await client.query(`
        create table if not exists app_schema_migrations (
          key character varying primary key,
          applied_at timestamp with time zone not null default now()
        )
      `);
      await client.query(`
        create table if not exists tenant_membership_permissions (
          membership_id uuid not null references tenant_memberships(id) on delete cascade,
          permission_key character varying not null,
          granted_by uuid references users(id) on delete set null,
          created_at timestamp with time zone not null default now(),
          updated_at timestamp with time zone not null default now(),
          primary key (membership_id, permission_key)
        )
      `);

      const migration = await client.query(
        'select key from app_schema_migrations where key = $1 limit 1',
        [ACCESS_MIGRATION_KEY],
      );

      if (!migration.rows[0]) {
        for (const permission of ALL_PERMISSIONS) {
          await client.query(
            `
              insert into tenant_membership_permissions (membership_id, permission_key)
              select id, $1
              from tenant_memberships
              where estado = 'activo' and lower(rol) in ('admin', 'super_admin')
              on conflict do nothing
            `,
            [permission],
          );
        }
        for (const permission of LEGACY_MEMBER_PERMISSIONS) {
          await client.query(
            `
              insert into tenant_membership_permissions (membership_id, permission_key)
              select id, $1
              from tenant_memberships
              where estado = 'activo' and lower(rol) = 'member'
              on conflict do nothing
            `,
            [permission],
          );
        }
        await client.query('insert into app_schema_migrations (key) values ($1)', [ACCESS_MIGRATION_KEY]);
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      accessControlSchemaPromise = null;
      throw error;
    } finally {
      client.release();
    }
  })();

  return accessControlSchemaPromise;
}

export async function loadMembershipPermissions(membershipId, role, db = query) {
  await ensureAccessControlSchema();
  if (isSuperAdmin(role)) return [...ALL_PERMISSIONS];
  const result = await db(
    `select permission_key from tenant_membership_permissions where membership_id = $1 order by permission_key`,
    [membershipId],
  );
  return getEffectivePermissions(role, result.rows.map((row) => row.permission_key));
}

export async function replaceMembershipPermissions(db, membershipId, values, grantedBy = null) {
  const permissions = validatePermissionKeys(values);
  await db('delete from tenant_membership_permissions where membership_id = $1', [membershipId]);
  for (const permission of permissions) {
    await db(
      `
        insert into tenant_membership_permissions (membership_id, permission_key, granted_by, updated_at)
        values ($1, $2, $3, now())
      `,
      [membershipId, permission, grantedBy],
    );
  }
  return permissions;
}

export function assertPermission(req, required, message = 'No tienes acceso a este módulo.') {
  const permissions = Array.isArray(required) ? required : [required];
  const effective = new Set(getEffectivePermissions(req.auth?.role, req.auth?.permissions));
  if (!permissions.some((permission) => effective.has(permission))) {
    const error = new Error(message);
    error.statusCode = 403;
    error.code = 'PERMISSION_DENIED';
    error.permission = permissions.length === 1 ? permissions[0] : undefined;
    throw error;
  }
}

export function assertSuperAdmin(req, message = 'Solo un Super Admin puede modificar los accesos.') {
  if (!isSuperAdmin(req.auth?.role)) {
    const error = new Error(message);
    error.statusCode = 403;
    error.code = 'PERMISSION_DENIED';
    throw error;
  }
}
