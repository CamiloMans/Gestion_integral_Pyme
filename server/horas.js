import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getTenant, pool, query } from './db.js';
import { todayInAppTimeZone } from './time.js';

const HORAS_TABLE = 'fct_hora_proyecto';
let horasSchemaPromise = null;
let proyectoActiveColumnPromise = null;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD.');
const rangoSchema = z.object({
  from: dateSchema,
  to: dateSchema,
}).refine(({ from, to }) => from <= to, {
  message: 'La fecha inicial no puede ser posterior a la fecha final.',
});
export const registroHorasSchema = z.object({
  proyectoId: z.string().uuid('El proyecto no es válido.'),
  fecha: dateSchema,
  horas: z.coerce.number()
    .positive('Las horas deben ser mayores a 0.')
    .max(24, 'No puedes cargar más de 24 horas en un día.')
    .refine((value) => Number.isInteger(value * 4), 'Las horas deben ingresarse en incrementos de 0,25.'),
  detalle: z.string().trim().max(500, 'El detalle no puede superar 500 caracteres.').optional().nullable(),
});
const dashboardQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
  proyectoId: z.union([z.literal('all'), z.string().uuid()]).optional().default('all'),
  userId: z.union([z.literal('all'), z.string().uuid()]).optional().default('all'),
}).refine(({ from, to }) => from <= to, {
  message: 'La fecha inicial no puede ser posterior a la fecha final.',
});

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

export function assertHoraDateIsNotFuture(fecha, today = todayInAppTimeZone()) {
  if (fecha > today) {
    const error = new Error('No puedes cargar horas en una fecha futura.');
    error.statusCode = 400;
    throw error;
  }
}

export function assertCanManageProjectHours(role, body) {
  if (Object.hasOwn(body || {}, 'permiteCargaHoras') && normalizeRole(role) !== 'super_admin') {
    const error = new Error('Solo un super administrador puede habilitar proyectos para cargar horas.');
    error.statusCode = 403;
    throw error;
  }
}

function sendError(res, error, fallback) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: error.issues[0]?.message || 'Datos inválidos.',
      details: error.flatten(),
    });
  }

  const persistenceStatus = {
    '23503': 400,
    '23505': 409,
    '23514': 400,
  }[String(error?.code || '')];
  const status = Number(error?.statusCode) || persistenceStatus || 500;
  const duplicateMessage = error?.code === '23505'
    ? 'Ya existe una carga para ese proyecto en la fecha seleccionada. Puedes editar el registro existente.'
    : null;

  return res.status(status).json({
    error: duplicateMessage || (error instanceof Error ? error.message : fallback),
  });
}

function mapRegistro(row) {
  return {
    id: row.id,
    proyectoId: row.proyecto_id,
    proyectoNombre: row.proyecto_nombre,
    proyectoCodigo: row.proyecto_codigo || undefined,
    userId: row.user_id,
    userNombre: row.user_nombre || row.user_email || 'Usuario sin nombre',
    userEmail: row.user_email || '',
    fecha: row.fecha,
    horas: Number(row.horas),
    detalle: row.detalle || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProyecto(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    codigoProyecto: row.codigo_proyecto || undefined,
  };
}

function mapUser(row) {
  return {
    id: row.id,
    nombre: row.nombre || row.email,
    email: row.email,
  };
}

export async function ensureHorasSchema() {
  if (horasSchemaPromise) {
    return horasSchemaPromise;
  }

  horasSchemaPromise = (async () => {
    await query(`
      alter table dim_proyecto
      add column if not exists permite_carga_horas boolean not null default false
    `);

    await query(`
      create table if not exists ${HORAS_TABLE} (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        proyecto_id uuid not null references dim_proyecto(id) on delete restrict,
        user_id uuid not null references users(id) on delete restrict,
        fecha date not null,
        horas numeric(5,2) not null check (horas > 0 and horas <= 24),
        detalle character varying(500),
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now(),
        constraint uq_hora_proyecto_usuario_fecha unique (tenant_id, proyecto_id, user_id, fecha)
      )
    `);

    await query(`
      create index if not exists idx_horas_tenant_fecha
      on ${HORAS_TABLE} (tenant_id, fecha desc)
    `);
    await query(`
      create index if not exists idx_horas_tenant_usuario_fecha
      on ${HORAS_TABLE} (tenant_id, user_id, fecha desc)
    `);
    await query(`
      create index if not exists idx_horas_tenant_proyecto_fecha
      on ${HORAS_TABLE} (tenant_id, proyecto_id, fecha desc)
    `);
  })().catch((error) => {
    horasSchemaPromise = null;
    throw error;
  });

  return horasSchemaPromise;
}

async function getProyectoHabilitado(tenantId, proyectoId, db = query) {
  const activeColumn = await getProyectoActiveColumn();
  const result = await db(
    `
      select id
      from dim_proyecto
      where tenant_id = $1
        and id = $2
        ${activeColumn ? `and ${activeColumn} = true` : ''}
        and permite_carga_horas = true
      limit 1
    `,
    [tenantId, proyectoId],
  );

  if (!result.rows[0]) {
    const error = new Error('El proyecto no está activo o no permite cargar horas.');
    error.statusCode = 400;
    throw error;
  }
}

async function getProyectoActiveColumn() {
  if (!proyectoActiveColumnPromise) {
    proyectoActiveColumnPromise = query(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'dim_proyecto'`,
    ).then((result) => {
      const columns = new Set(result.rows.map((row) => row.column_name));
      if (columns.has('activo')) return 'activo';
      if (columns.has('activa')) return 'activa';
      return null;
    }).catch((error) => {
      proyectoActiveColumnPromise = null;
      throw error;
    });
  }
  return proyectoActiveColumnPromise;
}

async function assertDailyCapacity({ tenantId, userId, fecha, horas, excludeId = null, db = query }) {
  const result = await db(
    `
      select coalesce(sum(horas), 0)::numeric as total
      from ${HORAS_TABLE}
      where tenant_id = $1
        and user_id = $2
        and fecha = $3
        and ($4::uuid is null or id <> $4::uuid)
    `,
    [tenantId, userId, fecha, excludeId],
  );
  const existingTotal = Number(result.rows[0]?.total || 0);

  assertDailyHoursLimit(existingTotal, horas);
}

export function assertDailyHoursLimit(existingTotal, newHours) {
  if (existingTotal + newHours > 24) {
    const error = new Error(`La carga supera el máximo diario de 24 horas. Ya tienes ${existingTotal} horas registradas ese día.`);
    error.statusCode = 400;
    throw error;
  }
}

async function getCurrentUserId(req) {
  const userId = req.auth?.user?.id;
  if (!userId) {
    const error = new Error('No se pudo identificar al usuario de la sesión.');
    error.statusCode = 401;
    throw error;
  }
  return userId;
}

const REGISTRO_SELECT = `
  select
    h.*,
    p.nombre as proyecto_nombre,
    p.codigo_proyecto as proyecto_codigo,
    u.nombre as user_nombre,
    u.email as user_email
  from ${HORAS_TABLE} h
  join dim_proyecto p on p.id = h.proyecto_id and p.tenant_id = h.tenant_id
  join users u on u.id = h.user_id
`;

export function registerHorasRoutes(app) {
  app.get('/api/horas', async (req, res) => {
    try {
      await ensureHorasSchema();
      const tenant = await getTenant();
      const userId = await getCurrentUserId(req);
      const range = rangoSchema.parse(req.query);
      const activeColumn = await getProyectoActiveColumn();
      const [proyectos, registros] = await Promise.all([
        query(
          `
            select id, nombre, codigo_proyecto
            from dim_proyecto
            where tenant_id = $1
              ${activeColumn ? `and ${activeColumn} = true` : ''}
              and permite_carga_horas = true
            order by nombre asc
          `,
          [tenant.id],
        ),
        query(
          `${REGISTRO_SELECT}
           where h.tenant_id = $1
             and h.user_id = $2
             and h.fecha between $3 and $4
           order by h.fecha desc, p.nombre asc`,
          [tenant.id, userId, range.from, range.to],
        ),
      ]);

      res.json({
        range,
        projects: proyectos.rows.map(mapProyecto),
        entries: registros.rows.map(mapRegistro),
      });
    } catch (error) {
      sendError(res, error, 'No se pudieron cargar tus horas.');
    }
  });

  app.post('/api/horas', async (req, res) => {
    try {
      await ensureHorasSchema();
      const tenant = await getTenant();
      const userId = await getCurrentUserId(req);
      const payload = registroHorasSchema.parse(req.body);
      assertHoraDateIsNotFuture(payload.fecha);
      const client = await pool.connect();
      let result;

      try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`${tenant.id}:${userId}:${payload.fecha}`]);
        await getProyectoHabilitado(tenant.id, payload.proyectoId, client.query.bind(client));
        await assertDailyCapacity({
          tenantId: tenant.id,
          userId,
          fecha: payload.fecha,
          horas: payload.horas,
          db: client.query.bind(client),
        });
        const inserted = await client.query(
          `
            insert into ${HORAS_TABLE} (id, tenant_id, proyecto_id, user_id, fecha, horas, detalle)
            values ($1, $2, $3, $4, $5, $6, $7)
            returning id
          `,
          [randomUUID(), tenant.id, payload.proyectoId, userId, payload.fecha, payload.horas, payload.detalle || null],
        );
        result = await client.query(`${REGISTRO_SELECT} where h.tenant_id = $1 and h.id = $2`, [tenant.id, inserted.rows[0].id]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
      res.status(201).json(mapRegistro(result.rows[0]));
    } catch (error) {
      sendError(res, error, 'No se pudo guardar la carga de horas.');
    }
  });

  app.put('/api/horas/:id', async (req, res) => {
    try {
      await ensureHorasSchema();
      const tenant = await getTenant();
      const userId = await getCurrentUserId(req);
      const payload = registroHorasSchema.parse(req.body);
      assertHoraDateIsNotFuture(payload.fecha);
      const client = await pool.connect();
      let result;

      try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`${tenant.id}:${userId}:${payload.fecha}`]);
        await getProyectoHabilitado(tenant.id, payload.proyectoId, client.query.bind(client));
        await assertDailyCapacity({
          tenantId: tenant.id,
          userId,
          fecha: payload.fecha,
          horas: payload.horas,
          excludeId: req.params.id,
          db: client.query.bind(client),
        });
        const updated = await client.query(
          `
            update ${HORAS_TABLE}
            set proyecto_id = $4, fecha = $5, horas = $6, detalle = $7, updated_at = now()
            where tenant_id = $1 and id = $2 and user_id = $3
            returning id
          `,
          [tenant.id, req.params.id, userId, payload.proyectoId, payload.fecha, payload.horas, payload.detalle || null],
        );
        if (!updated.rows[0]) {
          const error = new Error('No se encontró el registro o no te pertenece.');
          error.statusCode = 404;
          throw error;
        }
        result = await client.query(`${REGISTRO_SELECT} where h.tenant_id = $1 and h.id = $2`, [tenant.id, updated.rows[0].id]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
      res.json(mapRegistro(result.rows[0]));
    } catch (error) {
      sendError(res, error, 'No se pudo actualizar la carga de horas.');
    }
  });

  app.delete('/api/horas/:id', async (req, res) => {
    try {
      await ensureHorasSchema();
      const tenant = await getTenant();
      const userId = await getCurrentUserId(req);
      const result = await query(
        `delete from ${HORAS_TABLE} where tenant_id = $1 and id = $2 and user_id = $3`,
        [tenant.id, req.params.id, userId],
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'No se encontró el registro o no te pertenece.' });
      }
      res.status(204).send();
    } catch (error) {
      sendError(res, error, 'No se pudo eliminar la carga de horas.');
    }
  });

  app.get('/api/horas/dashboard', async (req, res) => {
    try {
      await ensureHorasSchema();
      const tenant = await getTenant();
      const filters = dashboardQuerySchema.parse(req.query);
      const params = [tenant.id, filters.from, filters.to];
      const conditions = ['h.tenant_id = $1', 'h.fecha between $2 and $3'];

      if (filters.proyectoId !== 'all') {
        params.push(filters.proyectoId);
        conditions.push(`h.proyecto_id = $${params.length}`);
      }
      if (filters.userId !== 'all') {
        params.push(filters.userId);
        conditions.push(`h.user_id = $${params.length}`);
      }

      const [registros, proyectos, users] = await Promise.all([
        query(`${REGISTRO_SELECT} where ${conditions.join(' and ')} order by h.fecha desc, p.nombre asc`, params),
        query(
          `select id, nombre, codigo_proyecto from dim_proyecto where tenant_id = $1 and permite_carga_horas = true order by nombre asc`,
          [tenant.id],
        ),
        query(
          `
            select u.id, u.nombre, u.email
            from tenant_memberships tm
            join users u on u.id = tm.user_id
            where tm.tenant_id = $1 and tm.estado = 'activo'
            order by coalesce(u.nombre, u.email) asc
          `,
          [tenant.id],
        ),
      ]);
      const entries = registros.rows.map(mapRegistro);
      const totalHours = entries.reduce((sum, entry) => sum + entry.horas, 0);

      res.json({
        filters,
        projects: proyectos.rows.map(mapProyecto),
        users: users.rows.map(mapUser),
        entries,
        summary: {
          totalHours,
          people: new Set(entries.map((entry) => entry.userId)).size,
          projects: new Set(entries.map((entry) => entry.proyectoId)).size,
          records: entries.length,
        },
      });
    } catch (error) {
      sendError(res, error, 'No se pudo cargar el dashboard de horas.');
    }
  });
}
