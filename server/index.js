import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { z } from 'zod';
import {
  changeSessionTenant,
  clearSessionCookie,
  createAuthError,
  createSessionCookie,
  ensureUserAuthIdentitiesSchema,
  exchangeAuthTokenForSession,
  resolveAppSessionFromRequest,
} from './auth.js';
import {
  closePool,
  getTenant,
  mergeRequestContext,
  pool,
  query,
  runWithRequestContext,
} from './db.js';
import {
  ensureCoreSchema,
  ensureDevSeedData,
  getDevAuthBypassDetails,
  isDevAuthBypassEnabled,
} from './local-dev.js';

const app = express();
const preferredPort = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === 'production';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

let viteDevServer = null;
const CATEGORY_COLOR_PALETTE = [
  '#FFFFBA',
  '#BAFFC9',
  '#BAE1FF',
  '#B0E0E6',
  '#DDA0DD',
  '#FFD6A5',
];
const tableColumnsCache = new Map();
const APP_TIMEZONE = String(process.env.APP_TIMEZONE || 'America/Santiago').trim() || 'America/Santiago';
const CONTROL_PAGOS_HITOS_TABLE = 'fct_hito_pago_proyecto';
const CONTROL_PAGOS_DOCUMENTOS_TABLE = 'fct_documento_proyecto';
const CONTROL_PAGOS_HITO_DOCUMENTOS_TABLE = 'fct_documento_hito';
const DOCUMENTOS_TABLE = 'documentos';
const GASTO_DOCUMENTOS_TABLE = 'fct_gasto_documento';
const ASISTENCIA_TABLE = 'fct_asistencia_trabajador';
const STORAGE_API_URL = String(process.env.STORAGE_API_URL || '').replace(/\/+$/, '');
const STORAGE_API_SECRET = String(process.env.STORAGE_API_SECRET || '');
const LOCAL_STORAGE_DIR = String(process.env.LOCAL_STORAGE_DIR || '.storage/documentos').trim() || '.storage/documentos';
const MAX_GASTO_ATTACHMENT_SIZE_MB = Number(process.env.MAX_GASTO_ATTACHMENT_SIZE_MB || 25);
const hasRemoteStorageConfig = Boolean(STORAGE_API_URL && STORAGE_API_SECRET);
const hasPartialRemoteStorageConfig = Boolean(STORAGE_API_URL || STORAGE_API_SECRET);
const localStorageRootDir = path.resolve(rootDir, LOCAL_STORAGE_DIR);
const PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/auth/exchange',
  '/api/auth/logout',
]);
let controlPagosHitosSchemaPromise = null;
let controlPagosDocumentosSchemaPromise = null;
let controlPagosHitoDocumentosSchemaPromise = null;
let documentosSchemaPromise = null;
let gastoDocumentosSchemaPromise = null;
let asistenciaSchemaPromise = null;

function isValidPort(value) {
  return Number.isInteger(value) && value > 0 && value < 65536;
}

async function canListenOnPort(port, host = '0.0.0.0') {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();

    probe.once('error', (error) => {
      probe.close(() => reject(error));
    });

    probe.once('listening', () => {
      probe.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve();
      });
    });

    probe.listen(port, host);
  });
}

async function resolveListenPort(basePort, host = '0.0.0.0') {
  const searchLimit = Number(process.env.PORT_SEARCH_LIMIT || 20);
  const normalizedBasePort = isValidPort(basePort) ? basePort : 3001;
  const maxAttempts = Number.isInteger(searchLimit) && searchLimit > 0 ? searchLimit : 20;

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidatePort = normalizedBasePort + offset;

    try {
      await canListenOnPort(candidatePort, host);
      return candidatePort;
    } catch (error) {
      if (error?.code !== 'EADDRINUSE') {
        throw error;
      }
    }
  }

  throw new Error(
    `No se encontro un puerto disponible desde ${normalizedBasePort} tras ${maxAttempts} intentos.`,
  );
}

const gastoAttachmentsUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(1, MAX_GASTO_ATTACHMENT_SIZE_MB) * 1024 * 1024,
  },
});

app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});
app.use(express.json({ limit: '2mb' }));

const proyectoInputSchema = z.object({
  nombre: z.string().trim().min(1),
  codigoProyecto: z.string().optional().nullable(),
  montoTotalProyecto: z.coerce.number().optional().nullable(),
  monedaBase: z.enum(['CLP', 'UF', 'USD']).optional().nullable(),
});

const categoriaInputSchema = z.object({
  nombre: z.string().trim().min(1),
  color: z.string().optional().nullable(),
});

const empresaInputSchema = z.object({
  razonSocial: z.string().trim().min(1),
  rut: z.string().optional().nullable(),
  numeroContacto: z.string().optional().nullable(),
  correoElectronico: z.string().optional().nullable(),
  categoria: z.enum(['Empresa', 'Persona Natural']).optional().nullable(),
});

const colaboradorInputSchema = z.object({
  nombre: z.string().trim().min(1),
  email: z.string().email().optional().nullable().or(z.literal('')),
  telefono: z.string().optional().nullable(),
  cargo: z.string().optional().nullable(),
});

const tipoDocumentoInputSchema = z.object({
  nombre: z.string().trim().min(1),
  descripcion: z.string().optional().nullable(),
  activo: z.boolean().optional().nullable(),
});

const tipoDocumentoProyectoInputSchema = z.object({
  nombre: z.string().trim().min(1),
  descripcion: z.string().optional().nullable(),
  activo: z.boolean().optional().nullable(),
});

const gastoInputSchema = z.object({
  fecha: z.string().min(1),
  empresaId: z.string().uuid(),
  categoria: z.string().uuid().optional().nullable(),
  tipoDocumento: z.string().uuid().optional().nullable(),
  numeroDocumento: z.string().default(''),
  monto: z.coerce.number().optional(),
  montoNeto: z.coerce.number().optional().nullable(),
  iva: z.coerce.number().optional().nullable(),
  montoTotal: z.coerce.number().optional(),
  detalle: z.string().optional().nullable(),
  proyectoId: z.string().uuid().optional().nullable(),
  colaboradorId: z.string().uuid().optional().nullable(),
  comentarioTipoDocumento: z.string().optional().nullable(),
  existingAttachmentIds: z.array(z.string().uuid()).optional().default([]),
});

const hitoPagoProyectoInputSchema = z.object({
  proyectoId: z.string().uuid(),
  nroHito: z.coerce.number().int().positive().optional().nullable(),
  montoHito: z.coerce.number().positive(),
  moneda: z.enum(['CLP', 'UF', 'USD']).optional().nullable(),
  fechaCompromiso: z.string().optional().nullable(),
  fechaPago: z.string().optional().nullable(),
  facturado: z.boolean().optional().nullable(),
  pagado: z.boolean().optional().nullable(),
  observacion: z.string().optional().nullable(),
});

const documentoProyectoInputSchema = z.object({
  proyectoId: z.string().uuid(),
  tipoDocumentoProyectoId: z.string().uuid(),
  fechaDocumento: z.string().optional().nullable(),
  nroReferencia: z.string().optional().nullable(),
  observacion: z.string().optional().nullable(),
});

const documentoHitoInputSchema = z.object({
  hitoPagoId: z.string().uuid(),
});

const authExchangeInputSchema = z.object({
  provider: z.enum(['microsoft', 'google']).optional().default('microsoft'),
  idToken: z.string().trim().min(1),
});

const sessionTenantInputSchema = z.object({
  tenantId: z.string().uuid(),
});

const inviteUserInputSchema = z.object({
  email: z.string().trim().email(),
  nombre: z.string().optional().nullable().or(z.literal('')),
  rol: z.enum(['member', 'admin']).optional().default('member'),
});

const asistenciaDashboardQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional().default(30),
});

const asistenciaRegistroInputSchema = z.object({
  tipo: z.enum(['entrada', 'salida']),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracyMeters: z.coerce.number().nonnegative().optional().nullable(),
});

function toNullable(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return value;
}

function normalizeText(value, { uppercase = false, lowercase = false } = {}) {
  const rawValue = typeof value === 'string' ? value.trim() : '';

  if (!rawValue) {
    return '';
  }

  if (uppercase) {
    return rawValue.toUpperCase();
  }

  if (lowercase) {
    return rawValue.toLowerCase();
  }

  return rawValue;
}

function normalizeNullableText(value, options) {
  const normalized = normalizeText(value, options);
  return normalized || null;
}

function normalizeNumeric(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateInTimeZone(date, timeZone = APP_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';

  return `${year}-${month}-${day}`;
}

function normalizeAuthProviders(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((provider) => String(provider || '').trim().toLowerCase()).filter(Boolean)));
  }

  if (typeof value === 'string') {
    try {
      return normalizeAuthProviders(JSON.parse(value));
    } catch (_error) {
      return [];
    }
  }

  return [];
}

function createStorageError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function buildStorageApiUrl(endpointPath, searchParams) {
  const url = new URL(endpointPath, `${STORAGE_API_URL}/`);

  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return url.toString();
}

function toSafeSegment(value, fallback = 'misc') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

function sanitizeFileName(fileName) {
  const safeFileName = String(fileName || '').trim();
  const lastDotIndex = safeFileName.lastIndexOf('.');
  const name = lastDotIndex > 0 ? safeFileName.slice(0, lastDotIndex) : safeFileName;
  const extension = lastDotIndex > 0 ? safeFileName.slice(lastDotIndex + 1) : '';
  const safeName = toSafeSegment(name, 'archivo');
  const safeExtension = extension
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

  return safeExtension ? `${safeName}.${safeExtension}` : safeName;
}

function buildStorageObjectPath({ folder, projectId, recordId, fileName }) {
  return path.posix.join(
    toSafeSegment(folder, 'gastos'),
    projectId ? toSafeSegment(projectId, 'sin-proyecto') : 'sin-proyecto',
    recordId ? toSafeSegment(recordId, 'sin-registro') : 'sin-registro',
    `${Date.now()}-${randomUUID()}-${sanitizeFileName(fileName)}`,
  );
}

function resolveLocalStoragePath(objectPath) {
  const normalizedObjectPath = String(objectPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const segments = normalizedObjectPath.split('/').filter(Boolean);

  if (segments.length === 0) {
    throw createStorageError('La ruta del archivo almacenado no es valida', 400);
  }

  const absolutePath = path.resolve(localStorageRootDir, ...segments);
  const relativePath = path.relative(localStorageRootDir, absolutePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw createStorageError('La ruta del archivo almacenado no es valida', 400);
  }

  return absolutePath;
}

async function uploadBufferToLocalStorage({ buffer, fileName, mimeType, folder, projectId, recordId }) {
  const objectPath = buildStorageObjectPath({ folder, projectId, recordId, fileName });
  const absolutePath = resolveLocalStoragePath(objectPath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  return {
    objectPath,
    originalName: fileName,
    contentType: mimeType || 'application/octet-stream',
    sizeBytes: buffer.length,
  };
}

async function uploadBufferToRemoteStorage({ buffer, fileName, mimeType, folder, projectId, recordId }) {
  if (!hasRemoteStorageConfig) {
    throw createStorageError('La integracion de almacenamiento remoto no esta configurada en el backend');
  }

  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), fileName);
  formData.append('folder', folder || 'gastos');

  if (projectId) {
    formData.append('projectId', projectId);
  }

  if (recordId) {
    formData.append('recordId', recordId);
  }

  const response = await fetch(buildStorageApiUrl('/upload'), {
    method: 'POST',
    headers: {
      'x-upload-secret': STORAGE_API_SECRET,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`No se pudo subir el archivo a Cloud Storage: ${response.status} ${errorBody}`.trim());
  }

  return response.json();
}

async function uploadBufferToStorage(storageInput) {
  if (hasRemoteStorageConfig) {
    return uploadBufferToRemoteStorage(storageInput);
  }

  return uploadBufferToLocalStorage(storageInput);
}

async function deleteStorageObject(objectPath) {
  if (!objectPath) {
    return;
  }

  if (!hasRemoteStorageConfig) {
    const absolutePath = resolveLocalStoragePath(objectPath);

    try {
      await fs.unlink(absolutePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }

    return;
  }

  const response = await fetch(buildStorageApiUrl('/objects'), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'x-upload-secret': STORAGE_API_SECRET,
    },
    body: JSON.stringify({ objectPath }),
  });

  if (!response.ok && response.status !== 404) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`No se pudo eliminar el archivo en storage: ${response.status} ${errorBody}`.trim());
  }
}

async function readStoredDocumentContent(documento) {
  if (hasRemoteStorageConfig) {
    const storageResponse = await fetch(
      buildStorageApiUrl('/objects/content', { objectPath: documento.storage_path }),
      {
        headers: {
          'x-upload-secret': STORAGE_API_SECRET,
        },
      },
    );

    if (!storageResponse.ok) {
      const errorBody = await storageResponse.text().catch(() => '');
      throw createStorageError(
        errorBody || 'No se pudo recuperar el archivo almacenado',
        storageResponse.status === 404 ? 404 : 502,
      );
    }

    const arrayBuffer = await storageResponse.arrayBuffer();

    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: storageResponse.headers.get('content-type') || documento.mime_type || 'application/octet-stream',
      contentLength: Number(storageResponse.headers.get('content-length') || 0) || undefined,
    };
  }

  const absolutePath = resolveLocalStoragePath(documento.storage_path);

  try {
    const buffer = await fs.readFile(absolutePath);

    return {
      buffer,
      contentType: documento.mime_type || 'application/octet-stream',
      contentLength: buffer.length,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw createStorageError('No se encontro el archivo almacenado localmente', 404);
    }

    throw error;
  }
}

function maybeHandleMultipartUploads(req, res, next) {
  if (req.is('multipart/form-data')) {
    return gastoAttachmentsUpload.array('archivosAdjuntos')(req, res, next);
  }

  next();
}

function maybeHandleSingleFileUpload(fieldName) {
  return (req, res, next) => {
    if (req.is('multipart/form-data')) {
      return gastoAttachmentsUpload.single(fieldName)(req, res, next);
    }

    next();
  };
}

const maybeHandleDocumentoProyectoUpload = maybeHandleSingleFileUpload('archivo');
const maybeHandleDocumentoHitoUpload = maybeHandleSingleFileUpload('archivo');

function parseMultipartPayload(req) {
  if (typeof req.body?.payload === 'string') {
    return JSON.parse(req.body.payload);
  }

  return req.body;
}

function parseGastoPayload(req) {
  return parseMultipartPayload(req);
}

function getCategoryColor(nombre) {
  const hash = [...nombre].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return CATEGORY_COLOR_PALETTE[hash % CATEGORY_COLOR_PALETTE.length];
}

async function getTableColumns(tableName) {
  if (tableColumnsCache.has(tableName)) {
    return tableColumnsCache.get(tableName);
  }

  const result = await query(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
    `,
    [tableName],
  );

  const columns = new Set(result.rows.map((row) => row.column_name));
  tableColumnsCache.set(tableName, columns);
  return columns;
}

async function getActiveColumnName(tableName) {
  const columns = await getTableColumns(tableName);

  if (columns.has('activo')) {
    return 'activo';
  }

  if (columns.has('activa')) {
    return 'activa';
  }

  return null;
}

function getRowActiveValue(row) {
  if (typeof row.activo === 'boolean') {
    return row.activo;
  }

  if (typeof row.activa === 'boolean') {
    return row.activa;
  }

  return undefined;
}

function mapEmpresa(row) {
  return {
    id: row.id,
    razonSocial: row.razon_social,
    rut: row.rut || '',
    numeroContacto: row.numero_contacto || undefined,
    correoElectronico: row.correo_electronico || undefined,
    categoria: row.categoria || undefined,
    activo: getRowActiveValue(row),
    createdAt: row.created_at,
  };
}

function mapProyecto(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    codigoProyecto: row.codigo_proyecto || undefined,
    montoTotalProyecto: normalizeNumeric(row.monto_total_proyecto) ?? undefined,
    monedaBase: row.moneda_base || undefined,
    activo: getRowActiveValue(row),
    createdAt: row.created_at,
  };
}

function mapCategoria(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    color: row.color || undefined,
    activa: getRowActiveValue(row),
  };
}

function mapTipoDocumento(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    descripcion: row.descripcion || undefined,
    activo: getRowActiveValue(row),
  };
}

function mapTipoDocumentoProyecto(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    descripcion: row.descripcion || undefined,
    activo: getRowActiveValue(row),
    createdAt: row.created_at,
  };
}

function mapColaborador(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    email: row.email || undefined,
    telefono: row.telefono || undefined,
    cargo: row.cargo || undefined,
    activo: getRowActiveValue(row),
    createdAt: row.created_at,
  };
}

function mapTenantUser(row) {
  const authProviders = normalizeAuthProviders(row.auth_providers);
  const authLinked = authProviders.length > 0;

  return {
    id: row.user_id || row.id,
    membershipId: row.membership_id,
    tenantId: row.tenant_id,
    email: row.email,
    nombre: row.nombre || row.email,
    authProvider: authProviders[0] || null,
    authProviders,
    authLinked,
    invitationState: authLinked ? 'vinculado' : 'pendiente',
    role: row.rol,
    estado: row.estado,
    createdAt: row.membership_created_at || row.created_at,
    updatedAt: row.membership_updated_at || row.updated_at,
  };
}

function mapAsistenciaRecord(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    userName: row.user_nombre || row.user_email || 'Usuario sin nombre',
    userEmail: row.user_email || '',
    role: row.user_role || undefined,
    workDate: row.work_date,
    status: row.salida_at ? 'cerrada' : 'abierta',
    entradaAt: row.entrada_at,
    entradaLatitude: Number(row.entrada_latitude),
    entradaLongitude: Number(row.entrada_longitude),
    entradaAccuracyMeters: row.entrada_accuracy_meters !== null
      ? Number(row.entrada_accuracy_meters)
      : undefined,
    salidaAt: row.salida_at || undefined,
    salidaLatitude: row.salida_latitude !== null ? Number(row.salida_latitude) : undefined,
    salidaLongitude: row.salida_longitude !== null ? Number(row.salida_longitude) : undefined,
    salidaAccuracyMeters: row.salida_accuracy_meters !== null
      ? Number(row.salida_accuracy_meters)
      : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGasto(row) {
  const montoTotal = Number(row.monto_total);
  const montoNeto = row.monto_neto !== null ? Number(row.monto_neto) : undefined;
  const iva = row.iva !== null ? Number(row.iva) : undefined;
  const archivosAdjuntosRaw = Array.isArray(row.archivos_adjuntos)
    ? row.archivos_adjuntos
    : typeof row.archivos_adjuntos === 'string'
      ? JSON.parse(row.archivos_adjuntos)
      : [];

  return {
    id: row.id,
    fecha: row.fecha,
    empresaId: row.empresa_id,
    categoria: row.categoria_id || '',
    tipoDocumento: row.tipo_documento_id || '',
    numeroDocumento: row.numero_documento || '',
    monto: montoTotal,
    montoNeto,
    iva,
    montoTotal,
    detalle: row.detalle || undefined,
    proyectoId: row.proyecto_id || undefined,
    colaboradorId: row.colaborador_id || undefined,
    colaboradorNombre: row.colaborador_nombre || undefined,
    comentarioTipoDocumento: row.comentario_tipo_documento || undefined,
    archivosAdjuntos: archivosAdjuntosRaw
      .filter((archivo) => archivo && archivo.id && archivo.nombre)
      .map((archivo) => ({
        id: archivo.id,
        nombre: archivo.nombre,
        url: archivo.url,
        tipo: archivo.tipo || 'application/octet-stream',
      })),
  };
}

function mapHitoPagoProyecto(row) {
  return {
    id: row.id,
    proyectoId: row.proyecto_id,
    codigoProyecto: row.codigo_proyecto || undefined,
    nroHito: Number(row.nro_hito || 0),
    montoHito: Number(row.monto || 0),
    moneda: row.moneda || row.moneda_base || 'CLP',
    fechaCompromiso: row.fecha_compromiso || '',
    fechaPago: row.fecha_pago || undefined,
    facturado: Boolean(row.facturado),
    pagado: Boolean(row.pagado),
    observacion: row.observacion || row.descripcion || undefined,
    createdAt: row.created_at,
  };
}

function mapDocumentoProyecto(row) {
  return {
    id: row.id,
    proyectoId: row.proyecto_id,
    codigoProyecto: row.codigo_proyecto || undefined,
    tipoDocumentoProyectoId: row.tipo_documento_id,
    tipoDocumentoNombre: row.tipo_documento_nombre || undefined,
    fechaDocumento: row.fecha_documento || undefined,
    nroReferencia: row.nro_referencia || undefined,
    observacion: row.observacion || undefined,
    createdAt: row.created_at,
    archivoAdjunto: row.nombre_archivo
      ? {
          nombre: row.nombre_archivo,
          url: row.documento_storage_id ? `/api/documentos/${row.documento_storage_id}/contenido` : '',
          tipo: row.mime_type || 'application/octet-stream',
        }
      : undefined,
  };
}

function mapDocumentoHito(row) {
  return {
    id: row.id,
    hitoPagoId: row.hito_pago_id,
    proyectoId: row.proyecto_id,
    codigoProyecto: row.codigo_proyecto || undefined,
    nroHito: Number(row.nro_hito),
    createdAt: row.created_at,
    archivoAdjunto: row.nombre_archivo
      ? {
          nombre: row.nombre_archivo,
          url: row.documento_storage_id ? `/api/documentos/${row.documento_storage_id}/contenido` : '',
          tipo: row.mime_type || 'application/octet-stream',
        }
      : undefined,
  };
}

function getHitoEstado({ facturado, pagado }) {
  if (pagado) {
    return 'PAGADO';
  }

  if (facturado) {
    return 'FACTURADO';
  }

  return 'PENDIENTE';
}

async function ensureControlPagosHitosSchema() {
  if (controlPagosHitosSchemaPromise) {
    return controlPagosHitosSchemaPromise;
  }

  controlPagosHitosSchemaPromise = (async () => {
    await query(`
      create table if not exists ${CONTROL_PAGOS_HITOS_TABLE} (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        proyecto_id uuid not null references dim_proyecto(id) on delete restrict,
        nombre character varying,
        descripcion text,
        fecha_compromiso date,
        fecha_pago date,
        monto numeric,
        estado character varying,
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now()
      )
    `);

    await query(`
      alter table ${CONTROL_PAGOS_HITOS_TABLE}
      add column if not exists nro_hito integer
    `);
    await query(`
      alter table ${CONTROL_PAGOS_HITOS_TABLE}
      add column if not exists moneda character varying(3) not null default 'CLP'
    `);
    await query(`
      alter table ${CONTROL_PAGOS_HITOS_TABLE}
      add column if not exists facturado boolean not null default false
    `);
    await query(`
      alter table ${CONTROL_PAGOS_HITOS_TABLE}
      add column if not exists pagado boolean not null default false
    `);
    await query(`
      alter table ${CONTROL_PAGOS_HITOS_TABLE}
      add column if not exists observacion text
    `);

    await query(`
      update ${CONTROL_PAGOS_HITOS_TABLE}
      set moneda = 'CLP'
      where moneda is null
         or trim(moneda) = ''
    `);
    await query(`
      update ${CONTROL_PAGOS_HITOS_TABLE}
      set facturado = false
      where facturado is null
    `);
    await query(`
      update ${CONTROL_PAGOS_HITOS_TABLE}
      set pagado = false
      where pagado is null
    `);
    await query(`
      update ${CONTROL_PAGOS_HITOS_TABLE}
      set observacion = descripcion
      where observacion is null
        and descripcion is not null
        and trim(descripcion) <> ''
    `);
    await query(`
      with ranked as (
        select
          id,
          row_number() over (
            partition by tenant_id, proyecto_id
            order by coalesce(fecha_compromiso, fecha_pago, created_at), created_at, id
          ) as next_nro
        from ${CONTROL_PAGOS_HITOS_TABLE}
      )
      update ${CONTROL_PAGOS_HITOS_TABLE} as hitos
      set nro_hito = ranked.next_nro
      from ranked
      where hitos.id = ranked.id
        and hitos.nro_hito is null
    `);
    await query(`
      update ${CONTROL_PAGOS_HITOS_TABLE}
      set estado = case
        when pagado = true then 'PAGADO'
        when facturado = true then 'FACTURADO'
        else 'PENDIENTE'
      end
      where estado is null
         or trim(estado) = ''
    `);
    await query(`
      create unique index if not exists uq_fct_hito_pago_proyecto_tenant_proyecto_nro_hito
      on ${CONTROL_PAGOS_HITOS_TABLE} (tenant_id, proyecto_id, nro_hito)
      where nro_hito is not null
    `);

    tableColumnsCache.delete(CONTROL_PAGOS_HITOS_TABLE);
  })().catch((error) => {
    controlPagosHitosSchemaPromise = null;
    throw error;
  });

  return controlPagosHitosSchemaPromise;
}

async function ensureControlPagosDocumentosSchema() {
  if (controlPagosDocumentosSchemaPromise) {
    return controlPagosDocumentosSchemaPromise;
  }

  controlPagosDocumentosSchemaPromise = (async () => {
    await ensureDocumentosSchema();

    await query(`
      create table if not exists ${CONTROL_PAGOS_DOCUMENTOS_TABLE} (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        proyecto_id uuid not null references dim_proyecto(id) on delete restrict,
        documento_id uuid references documentos(id) on delete set null,
        tipo_documento_id uuid references dim_tipo_documento_proyecto(id) on delete set null,
        created_at timestamp with time zone not null default now()
      )
    `);

    await query(`
      alter table ${CONTROL_PAGOS_DOCUMENTOS_TABLE}
      alter column documento_id drop not null
    `);
    await query(`
      alter table ${CONTROL_PAGOS_DOCUMENTOS_TABLE}
      drop constraint if exists fct_documento_proyecto_tipo_documento_id_fkey
    `);
    await query(`
      alter table ${CONTROL_PAGOS_DOCUMENTOS_TABLE}
      add constraint fct_documento_proyecto_tipo_documento_id_fkey
      foreign key (tipo_documento_id)
      references dim_tipo_documento_proyecto(id)
      on delete set null
    `);
    await query(`
      alter table ${CONTROL_PAGOS_DOCUMENTOS_TABLE}
      add column if not exists fecha_documento date
    `);
    await query(`
      alter table ${CONTROL_PAGOS_DOCUMENTOS_TABLE}
      add column if not exists nro_referencia character varying
    `);
    await query(`
      alter table ${CONTROL_PAGOS_DOCUMENTOS_TABLE}
      add column if not exists observacion text
    `);
    await query(`
      alter table ${CONTROL_PAGOS_DOCUMENTOS_TABLE}
      add column if not exists updated_at timestamp with time zone not null default now()
    `);

    await query(`
      update ${CONTROL_PAGOS_DOCUMENTOS_TABLE}
      set updated_at = created_at
      where updated_at is null
    `);
    await query(`
      create index if not exists idx_fct_documento_proyecto_tenant_proyecto
      on ${CONTROL_PAGOS_DOCUMENTOS_TABLE} (tenant_id, proyecto_id)
    `);

    tableColumnsCache.delete(CONTROL_PAGOS_DOCUMENTOS_TABLE);
  })().catch((error) => {
    controlPagosDocumentosSchemaPromise = null;
    throw error;
  });

  return controlPagosDocumentosSchemaPromise;
}

async function ensureControlPagosHitoDocumentosSchema() {
  if (controlPagosHitoDocumentosSchemaPromise) {
    return controlPagosHitoDocumentosSchemaPromise;
  }

  controlPagosHitoDocumentosSchemaPromise = (async () => {
    await ensureDocumentosSchema();
    await ensureControlPagosHitosSchema();

    await query(`
      create table if not exists ${CONTROL_PAGOS_HITO_DOCUMENTOS_TABLE} (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        hito_pago_id uuid not null references ${CONTROL_PAGOS_HITOS_TABLE}(id) on delete cascade,
        documento_id uuid not null references ${DOCUMENTOS_TABLE}(id) on delete cascade,
        created_at timestamp with time zone not null default now(),
        unique (tenant_id, hito_pago_id, documento_id)
      )
    `);

    await query(`
      create index if not exists idx_fct_documento_hito_tenant_hito
      on ${CONTROL_PAGOS_HITO_DOCUMENTOS_TABLE} (tenant_id, hito_pago_id, created_at desc)
    `);

    await query(`
      create index if not exists idx_fct_documento_hito_tenant_documento
      on ${CONTROL_PAGOS_HITO_DOCUMENTOS_TABLE} (tenant_id, documento_id)
    `);

    tableColumnsCache.delete(CONTROL_PAGOS_HITO_DOCUMENTOS_TABLE);
  })().catch((error) => {
    controlPagosHitoDocumentosSchemaPromise = null;
    throw error;
  });

  return controlPagosHitoDocumentosSchemaPromise;
}

async function ensureDocumentosSchema() {
  if (documentosSchemaPromise) {
    return documentosSchemaPromise;
  }

  documentosSchemaPromise = (async () => {
    await query(`
      create table if not exists ${DOCUMENTOS_TABLE} (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        nombre_archivo character varying not null,
        mime_type character varying not null default 'application/octet-stream',
        storage_path text not null,
        size_bytes bigint,
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now()
      )
    `);

    await query(`
      create index if not exists idx_documentos_tenant_created_at
      on ${DOCUMENTOS_TABLE} (tenant_id, created_at desc)
    `);

    tableColumnsCache.delete(DOCUMENTOS_TABLE);
  })().catch((error) => {
    documentosSchemaPromise = null;
    throw error;
  });

  return documentosSchemaPromise;
}

async function ensureGastoDocumentosSchema() {
  if (gastoDocumentosSchemaPromise) {
    return gastoDocumentosSchemaPromise;
  }

  gastoDocumentosSchemaPromise = (async () => {
    await ensureDocumentosSchema();

    await query(`
      create table if not exists ${GASTO_DOCUMENTOS_TABLE} (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        gasto_id uuid not null references fct_gasto(id) on delete cascade,
        documento_id uuid not null references ${DOCUMENTOS_TABLE}(id) on delete cascade,
        created_at timestamp with time zone not null default now(),
        unique (tenant_id, gasto_id, documento_id)
      )
    `);

    await query(`
      create index if not exists idx_fct_gasto_documento_tenant_gasto
      on ${GASTO_DOCUMENTOS_TABLE} (tenant_id, gasto_id, created_at asc)
    `);

    await query(`
      create index if not exists idx_fct_gasto_documento_tenant_documento
      on ${GASTO_DOCUMENTOS_TABLE} (tenant_id, documento_id)
    `);
  })().catch((error) => {
    gastoDocumentosSchemaPromise = null;
    throw error;
  });

  return gastoDocumentosSchemaPromise;
}

async function ensureAsistenciaSchema() {
  if (asistenciaSchemaPromise) {
    return asistenciaSchemaPromise;
  }

  asistenciaSchemaPromise = (async () => {
    await query(`
      create table if not exists ${ASISTENCIA_TABLE} (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        work_date date not null,
        entrada_at timestamp with time zone not null,
        entrada_latitude double precision not null,
        entrada_longitude double precision not null,
        entrada_accuracy_meters double precision,
        salida_at timestamp with time zone,
        salida_latitude double precision,
        salida_longitude double precision,
        salida_accuracy_meters double precision,
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now()
      )
    `);

    await query(`
      create unique index if not exists uq_fct_asistencia_trabajador_tenant_user_work_date
      on ${ASISTENCIA_TABLE} (tenant_id, user_id, work_date)
    `);

    await query(`
      create unique index if not exists uq_fct_asistencia_trabajador_open_shift
      on ${ASISTENCIA_TABLE} (tenant_id, user_id)
      where salida_at is null
    `);

    await query(`
      create index if not exists idx_fct_asistencia_trabajador_tenant_work_date
      on ${ASISTENCIA_TABLE} (tenant_id, work_date desc, entrada_at desc)
    `);

    await query(`
      create index if not exists idx_fct_asistencia_trabajador_tenant_user
      on ${ASISTENCIA_TABLE} (tenant_id, user_id, entrada_at desc)
    `);
  })().catch((error) => {
    asistenciaSchemaPromise = null;
    throw error;
  });

  return asistenciaSchemaPromise;
}

async function deactivateOrDeleteDimension(tenantId, tableName, itemId) {
  const activeColumn = await getActiveColumnName(tableName);

  if (activeColumn) {
    return query(
      `
        update ${tableName}
        set
          ${activeColumn} = false,
          updated_at = now()
        where tenant_id = $1
          and id = $2
      `,
      [tenantId, itemId],
    );
  }

  return query(
    `
      delete from ${tableName}
      where tenant_id = $1
        and id = $2
    `,
    [tenantId, itemId],
  );
}

async function fetchBootstrapData(tenantId) {
  const [
    empresaActiveColumn,
    proyectoActiveColumn,
    categoriaActiveColumn,
    tipoDocumentoActiveColumn,
    colaboradorActiveColumn,
  ] = await Promise.all([
    getActiveColumnName('dim_empresa'),
    getActiveColumnName('dim_proyecto'),
    getActiveColumnName('dim_categoria'),
    getActiveColumnName('dim_tipo_documento'),
    getActiveColumnName('dim_colaborador'),
  ]);

  const [empresas, proyectos, categorias, tiposDocumento, colaboradores] = await Promise.all([
    query(
      `
        select *
        from dim_empresa
        where tenant_id = $1
        ${empresaActiveColumn ? `  and ${empresaActiveColumn} = true` : ''}
        order by razon_social asc
      `,
      [tenantId],
    ),
    query(
      `
        select *
        from dim_proyecto
        where tenant_id = $1
        ${proyectoActiveColumn ? `  and ${proyectoActiveColumn} = true` : ''}
        order by nombre asc
      `,
      [tenantId],
    ),
    query(
      `
        select *
        from dim_categoria
        where tenant_id = $1
        ${categoriaActiveColumn ? `  and ${categoriaActiveColumn} = true` : ''}
        order by nombre asc
      `,
      [tenantId],
    ),
    query(
      `
        select *
        from dim_tipo_documento
        where tenant_id = $1
        ${tipoDocumentoActiveColumn ? `  and ${tipoDocumentoActiveColumn} = true` : ''}
        order by nombre asc
      `,
      [tenantId],
    ),
    query(
      `
        select *
        from dim_colaborador
        where tenant_id = $1
        ${colaboradorActiveColumn ? `  and ${colaboradorActiveColumn} = true` : ''}
        order by nombre asc
      `,
      [tenantId],
    ),
  ]);

  return {
    empresas: empresas.rows.map(mapEmpresa),
    proyectos: proyectos.rows.map(mapProyecto),
    categorias: categorias.rows.map(mapCategoria),
    tiposDocumento: tiposDocumento.rows.map(mapTipoDocumento),
    colaboradores: colaboradores.rows.map(mapColaborador),
  };
}

async function fetchConfigurationData(tenantId) {
  const [empresas, proyectos, colaboradores, categorias, tiposDocumento, tiposDocumentoProyecto] = await Promise.all([
    query(
      `
        select *
        from dim_empresa
        where tenant_id = $1
        order by razon_social asc
      `,
      [tenantId],
    ),
    query(
      `
        select *
        from dim_proyecto
        where tenant_id = $1
        order by nombre asc
      `,
      [tenantId],
    ),
    query(
      `
        select *
        from dim_colaborador
        where tenant_id = $1
        order by nombre asc
      `,
      [tenantId],
    ),
    query(
      `
        select *
        from dim_categoria
        where tenant_id = $1
        order by nombre asc
      `,
      [tenantId],
    ),
    query(
      `
        select *
        from dim_tipo_documento
        where tenant_id = $1
        order by nombre asc
      `,
      [tenantId],
    ),
    query(
      `
        select *
        from dim_tipo_documento_proyecto
        where tenant_id = $1
        order by nombre asc
      `,
      [tenantId],
    ),
  ]);

  return {
    empresas: empresas.rows.map(mapEmpresa),
    proyectos: proyectos.rows.map(mapProyecto),
    colaboradores: colaboradores.rows.map(mapColaborador),
    categorias: categorias.rows.map(mapCategoria),
    tiposDocumento: tiposDocumento.rows.map(mapTipoDocumento),
    tiposDocumentoProyecto: tiposDocumentoProyecto.rows.map(mapTipoDocumentoProyecto),
  };
}

async function fetchTenantUsers(tenantId, db = query) {
  await ensureUserAuthIdentitiesSchema();

  const result = await db(
    `
      select
        u.id as user_id,
        u.email,
        u.nombre,
        coalesce(
          (
            select json_agg(identity.provider order by identity.provider)
            from user_auth_identities identity
            where identity.user_id = u.id
          ),
          '[]'::json
        ) as auth_providers,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at,
        tm.id as membership_id,
        tm.tenant_id,
        tm.rol,
        tm.estado,
        tm.created_at as membership_created_at,
        tm.updated_at as membership_updated_at
      from tenant_memberships tm
      inner join users u
        on u.id = tm.user_id
      where tm.tenant_id = $1
      order by lower(u.email) asc, tm.created_at asc
    `,
    [tenantId],
  );

  return result.rows.map(mapTenantUser);
}

async function fetchTenantUserByUserId(tenantId, userId, db = query) {
  await ensureUserAuthIdentitiesSchema();

  const result = await db(
    `
      select
        u.id as user_id,
        u.email,
        u.nombre,
        coalesce(
          (
            select json_agg(identity.provider order by identity.provider)
            from user_auth_identities identity
            where identity.user_id = u.id
          ),
          '[]'::json
        ) as auth_providers,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at,
        tm.id as membership_id,
        tm.tenant_id,
        tm.rol,
        tm.estado,
        tm.created_at as membership_created_at,
        tm.updated_at as membership_updated_at
      from tenant_memberships tm
      inner join users u
        on u.id = tm.user_id
      where tm.tenant_id = $1
        and tm.user_id = $2
      limit 1
    `,
    [tenantId, userId],
  );

  return result.rows[0] ? mapTenantUser(result.rows[0]) : null;
}

async function fetchAsistenciaRecordById(tenantId, asistenciaId, db = query) {
  await ensureAsistenciaSchema();

  const result = await db(
    `
      select
        a.*,
        u.nombre as user_nombre,
        u.email as user_email,
        tm.rol as user_role
      from ${ASISTENCIA_TABLE} a
      inner join users u
        on u.id = a.user_id
      left join tenant_memberships tm
        on tm.tenant_id = a.tenant_id
       and tm.user_id = a.user_id
      where a.tenant_id = $1
        and a.id = $2
      limit 1
    `,
    [tenantId, asistenciaId],
  );

  return result.rows[0] ? mapAsistenciaRecord(result.rows[0]) : null;
}

async function fetchAsistenciaOpenRecordByUser(
  tenantId,
  userId,
  db = query,
  { forUpdate = false } = {},
) {
  await ensureAsistenciaSchema();

  const result = await db(
    `
      select
        a.*,
        u.nombre as user_nombre,
        u.email as user_email,
        tm.rol as user_role
      from ${ASISTENCIA_TABLE} a
      inner join users u
        on u.id = a.user_id
      left join tenant_memberships tm
        on tm.tenant_id = a.tenant_id
       and tm.user_id = a.user_id
      where a.tenant_id = $1
        and a.user_id = $2
        and a.salida_at is null
      order by a.entrada_at desc
      limit 1
      ${forUpdate ? 'for update of a' : ''}
    `,
    [tenantId, userId],
  );

  return result.rows[0] ? mapAsistenciaRecord(result.rows[0]) : null;
}

async function fetchAsistenciaRecords(tenantId, { days = 30 } = {}, db = query) {
  await ensureAsistenciaSchema();

  const result = await db(
    `
      select
        a.*,
        u.nombre as user_nombre,
        u.email as user_email,
        tm.rol as user_role
      from ${ASISTENCIA_TABLE} a
      inner join users u
        on u.id = a.user_id
      left join tenant_memberships tm
        on tm.tenant_id = a.tenant_id
       and tm.user_id = a.user_id
      where a.tenant_id = $1
        and (
          a.work_date >= (timezone($2, now()))::date - ($3::int - 1)
          or a.salida_at is null
        )
      order by a.work_date desc, a.entrada_at desc, lower(coalesce(u.nombre, u.email)) asc
    `,
    [tenantId, APP_TIMEZONE, days],
  );

  return result.rows.map(mapAsistenciaRecord);
}

async function fetchAsistenciaDashboard(tenantId, currentUserId, { days = 30 } = {}) {
  await ensureAsistenciaSchema();

  const [records, users, currentUserOpenRecord] = await Promise.all([
    fetchAsistenciaRecords(tenantId, { days }),
    fetchTenantUsers(tenantId),
    currentUserId ? fetchAsistenciaOpenRecordByUser(tenantId, currentUserId) : Promise.resolve(null),
  ]);

  const today = formatDateInTimeZone(new Date(), APP_TIMEZONE);
  const rangeStartDate = new Date();
  rangeStartDate.setDate(rangeStartDate.getDate() - Math.max(0, days - 1));
  const startDate = formatDateInTimeZone(rangeStartDate, APP_TIMEZONE);
  const recordsInRange = records.filter((record) => record.workDate >= startDate);
  const activeUsers = users.filter((user) => user.estado !== 'inactivo');

  return {
    timeZone: APP_TIMEZONE,
    range: {
      days,
      startDate,
      endDate: today,
    },
    summary: {
      activeNow: records.filter((record) => !record.salidaAt).length,
      completedToday: records.filter((record) => record.workDate === today && Boolean(record.salidaAt)).length,
      recordsInRange: recordsInRange.length,
      uniqueWorkersInRange: new Set(recordsInRange.map((record) => record.userId)).size,
    },
    currentUserOpenRecord,
    users: activeUsers,
    records,
  };
}

async function registerAsistenciaMark({ tenantId, userId, tipo, latitude, longitude, accuracyMeters }) {
  await ensureAsistenciaSchema();

  const client = await pool.connect();
  let recordId = null;

  try {
    await client.query('begin');

    const db = (text, params) => client.query(text, params);
    const openRecord = await fetchAsistenciaOpenRecordByUser(tenantId, userId, db, { forUpdate: true });

    if (tipo === 'entrada') {
      if (openRecord) {
        throw createAuthError(
          'Ya tienes una jornada abierta. Registra la salida antes de marcar una nueva entrada.',
          409,
        );
      }

      const sameDayResult = await client.query(
        `
          select id, salida_at
          from ${ASISTENCIA_TABLE}
          where tenant_id = $1
            and user_id = $2
            and work_date = (timezone($3, now()))::date
          limit 1
          for update
        `,
        [tenantId, userId, APP_TIMEZONE],
      );
      const sameDayRecord = sameDayResult.rows[0] || null;

      if (sameDayRecord) {
        throw createAuthError(
          sameDayRecord.salida_at
            ? 'Ya registraste tu jornada de hoy.'
            : 'Ya tienes una entrada registrada para hoy.',
          409,
        );
      }

      const insertResult = await client.query(
        `
          insert into ${ASISTENCIA_TABLE} (
            id,
            tenant_id,
            user_id,
            work_date,
            entrada_at,
            entrada_latitude,
            entrada_longitude,
            entrada_accuracy_meters,
            created_at,
            updated_at
          )
          values (
            $1,
            $2,
            $3,
            (timezone($4, now()))::date,
            now(),
            $5,
            $6,
            $7,
            now(),
            now()
          )
          returning id
        `,
        [
          randomUUID(),
          tenantId,
          userId,
          APP_TIMEZONE,
          latitude,
          longitude,
          normalizeNumeric(accuracyMeters),
        ],
      );

      recordId = insertResult.rows[0]?.id || null;
    } else {
      if (!openRecord) {
        throw createAuthError('No tienes una entrada pendiente por cerrar.', 409);
      }

      const updateResult = await client.query(
        `
          update ${ASISTENCIA_TABLE}
          set
            salida_at = now(),
            salida_latitude = $4,
            salida_longitude = $5,
            salida_accuracy_meters = $6,
            updated_at = now()
          where tenant_id = $1
            and user_id = $2
            and id = $3
            and salida_at is null
          returning id
        `,
        [
          tenantId,
          userId,
          openRecord.id,
          latitude,
          longitude,
          normalizeNumeric(accuracyMeters),
        ],
      );

      recordId = updateResult.rows[0]?.id || null;

      if (!recordId) {
        throw createAuthError('La jornada abierta ya fue cerrada desde otra sesion.', 409);
      }
    }

    await client.query('commit');

    const savedRecord = await fetchAsistenciaRecordById(tenantId, recordId);

    if (!savedRecord) {
      throw createAuthError('No se pudo recuperar el registro de asistencia guardado.', 500);
    }

    return savedRecord;
  } catch (error) {
    await client.query('rollback');

    if (error?.code === '23505') {
      if (error?.constraint === 'uq_fct_asistencia_trabajador_open_shift') {
        throw createAuthError(
          'Ya existe una jornada abierta para este usuario. Actualiza la pantalla antes de reintentar.',
          409,
        );
      }

      if (error?.constraint === 'uq_fct_asistencia_trabajador_tenant_user_work_date') {
        throw createAuthError('Ya existe un registro de asistencia para hoy.', 409);
      }
    }

    throw error;
  } finally {
    client.release();
  }
}

async function fetchGastos(tenantId) {
  await ensureGastoDocumentosSchema();

  const result = await query(
    `
      select
        g.*,
        c.nombre as colaborador_nombre,
        coalesce(
          json_agg(
            json_build_object(
              'id', d.id,
              'nombre', d.nombre_archivo,
              'url', '/api/documentos/' || d.id || '/contenido',
              'tipo', d.mime_type
            )
            order by gd.created_at asc
          ) filter (where d.id is not null),
          '[]'::json
        ) as archivos_adjuntos
      from fct_gasto g
      left join dim_colaborador c
        on c.id = g.colaborador_id
      left join ${GASTO_DOCUMENTOS_TABLE} gd
        on gd.tenant_id = g.tenant_id
       and gd.gasto_id = g.id
      left join ${DOCUMENTOS_TABLE} d
        on d.tenant_id = g.tenant_id
       and d.id = gd.documento_id
      where g.tenant_id = $1
      group by g.id, c.nombre
      order by g.fecha desc, g.created_at desc
    `,
    [tenantId],
  );

  return result.rows.map(mapGasto);
}

async function fetchGastoById(tenantId, gastoId) {
  await ensureGastoDocumentosSchema();

  const result = await query(
    `
      select
        g.*,
        c.nombre as colaborador_nombre,
        coalesce(
          json_agg(
            json_build_object(
              'id', d.id,
              'nombre', d.nombre_archivo,
              'url', '/api/documentos/' || d.id || '/contenido',
              'tipo', d.mime_type
            )
            order by gd.created_at asc
          ) filter (where d.id is not null),
          '[]'::json
        ) as archivos_adjuntos
      from fct_gasto g
      left join dim_colaborador c
        on c.id = g.colaborador_id
      left join ${GASTO_DOCUMENTOS_TABLE} gd
        on gd.tenant_id = g.tenant_id
       and gd.gasto_id = g.id
      left join ${DOCUMENTOS_TABLE} d
        on d.tenant_id = g.tenant_id
       and d.id = gd.documento_id
      where g.tenant_id = $1
        and g.id = $2
      group by g.id, c.nombre
      limit 1
    `,
    [tenantId, gastoId],
  );

  return result.rows[0] ? mapGasto(result.rows[0]) : null;
}

async function fetchGastoDocumentos(tenantId, gastoId, db = query) {
  const result = await db(
    `
      select
        d.id,
        d.nombre_archivo,
        d.mime_type,
        d.storage_path,
        d.size_bytes
      from ${GASTO_DOCUMENTOS_TABLE} gd
      inner join ${DOCUMENTOS_TABLE} d
        on d.tenant_id = gd.tenant_id
       and d.id = gd.documento_id
      where gd.tenant_id = $1
        and gd.gasto_id = $2
      order by gd.created_at asc
    `,
    [tenantId, gastoId],
  );

  return result.rows;
}

async function createDocumentoRecord(db, tenantId, documento) {
  const documentoId = randomUUID();

  await db(
    `
      insert into ${DOCUMENTOS_TABLE} (
        id,
        tenant_id,
        nombre_archivo,
        mime_type,
        storage_path,
        size_bytes
      )
      values ($1, $2, $3, $4, $5, $6)
    `,
    [
      documentoId,
      tenantId,
      documento.originalName,
      documento.contentType || 'application/octet-stream',
      documento.objectPath,
      normalizeNumeric(documento.sizeBytes),
    ],
  );

  return documentoId;
}

async function deleteStoredDocumentsByIds(db, tenantId, documentIds) {
  if (documentIds.length === 0) {
    return [];
  }

  const result = await db(
    `
      delete from ${DOCUMENTOS_TABLE}
      where tenant_id = $1
        and id = any($2::uuid[])
      returning id, storage_path
    `,
    [tenantId, documentIds],
  );

  return result.rows;
}

async function attachUploadedFilesToGasto(db, tenantId, gastoId, uploadedFiles) {
  for (const uploadedFile of uploadedFiles) {
    const documentoId = await createDocumentoRecord(db, tenantId, uploadedFile);

    await db(
      `
        insert into ${GASTO_DOCUMENTOS_TABLE} (
          id,
          tenant_id,
          gasto_id,
          documento_id
        )
        values ($1, $2, $3, $4)
      `,
      [randomUUID(), tenantId, gastoId, documentoId],
    );
  }
}

async function removeGastoDocumentos(db, tenantId, gastoId, documentIdsToRemove) {
  if (documentIdsToRemove.length === 0) {
    return [];
  }

  const result = await db(
    `
      delete from ${DOCUMENTOS_TABLE} d
      using ${GASTO_DOCUMENTOS_TABLE} gd
      where gd.tenant_id = $1
        and gd.gasto_id = $2
        and gd.documento_id = any($3::uuid[])
        and d.tenant_id = gd.tenant_id
        and d.id = gd.documento_id
      returning d.id, d.storage_path
    `,
    [tenantId, gastoId, documentIdsToRemove],
  );

  return result.rows;
}

async function cleanupStorageObjects(records) {
  for (const record of records) {
    try {
      await deleteStorageObject(record.objectPath || record.storage_path);
    } catch (error) {
      console.warn('No se pudo eliminar un objeto en Cloud Storage', {
        objectPath: record.objectPath || record.storage_path,
        error: error instanceof Error ? error.message : error,
      });
    }
  }
}

async function fetchStoredDocumentById(tenantId, documentId) {
  await ensureDocumentosSchema();

  const result = await query(
    `
      select id, nombre_archivo, mime_type, storage_path, size_bytes
      from ${DOCUMENTOS_TABLE}
      where tenant_id = $1
        and id = $2
      limit 1
    `,
    [tenantId, documentId],
  );

  return result.rows[0] || null;
}

async function fetchHitosPagoProyecto(tenantId) {
  await ensureControlPagosHitosSchema();

  const result = await query(
    `
      select
        h.*,
        p.codigo_proyecto,
        p.moneda_base
      from ${CONTROL_PAGOS_HITOS_TABLE} h
      inner join dim_proyecto p
        on p.id = h.proyecto_id
      where h.tenant_id = $1
      order by p.nombre asc, h.nro_hito asc, h.created_at asc
    `,
    [tenantId],
  );

  return result.rows.map(mapHitoPagoProyecto);
}

async function fetchHitoPagoProyectoById(tenantId, hitoId) {
  await ensureControlPagosHitosSchema();

  const result = await query(
    `
      select
        h.*,
        p.codigo_proyecto,
        p.moneda_base
      from ${CONTROL_PAGOS_HITOS_TABLE} h
      inner join dim_proyecto p
        on p.id = h.proyecto_id
      where h.tenant_id = $1
        and h.id = $2
      limit 1
    `,
    [tenantId, hitoId],
  );

  return result.rows[0] ? mapHitoPagoProyecto(result.rows[0]) : null;
}

async function getNextHitoNumber(tenantId, proyectoId) {
  await ensureControlPagosHitosSchema();

  const result = await query(
    `
      select coalesce(max(nro_hito), 0) + 1 as next_nro
      from ${CONTROL_PAGOS_HITOS_TABLE}
      where tenant_id = $1
        and proyecto_id = $2
    `,
    [tenantId, proyectoId],
  );

  return Number(result.rows[0]?.next_nro || 1);
}

async function fetchDocumentosProyecto(tenantId) {
  await ensureControlPagosDocumentosSchema();

  const result = await query(
    `
      select
        dp.*,
        p.codigo_proyecto,
        t.nombre as tipo_documento_nombre,
        d.id as documento_storage_id,
        d.nombre_archivo,
        d.mime_type,
        d.storage_path
      from ${CONTROL_PAGOS_DOCUMENTOS_TABLE} dp
      inner join dim_proyecto p
        on p.id = dp.proyecto_id
      left join dim_tipo_documento_proyecto t
        on t.id = dp.tipo_documento_id
      left join documentos d
        on d.id = dp.documento_id
       and d.tenant_id = dp.tenant_id
      where dp.tenant_id = $1
      order by dp.fecha_documento desc nulls last, dp.created_at desc
    `,
    [tenantId],
  );

  return result.rows.map(mapDocumentoProyecto);
}

async function fetchDocumentoProyectoById(tenantId, documentoProyectoId) {
  await ensureControlPagosDocumentosSchema();

  const result = await query(
    `
      select
        dp.*,
        p.codigo_proyecto,
        t.nombre as tipo_documento_nombre,
        d.id as documento_storage_id,
        d.nombre_archivo,
        d.mime_type,
        d.storage_path
      from ${CONTROL_PAGOS_DOCUMENTOS_TABLE} dp
      inner join dim_proyecto p
        on p.id = dp.proyecto_id
      left join dim_tipo_documento_proyecto t
        on t.id = dp.tipo_documento_id
      left join documentos d
        on d.id = dp.documento_id
       and d.tenant_id = dp.tenant_id
      where dp.tenant_id = $1
        and dp.id = $2
      limit 1
    `,
    [tenantId, documentoProyectoId],
  );

  return result.rows[0] ? mapDocumentoProyecto(result.rows[0]) : null;
}

async function fetchDocumentoProyectoStorageInfo(tenantId, documentoProyectoId) {
  await ensureControlPagosDocumentosSchema();

  const result = await query(
    `
      select
        dp.id,
        dp.proyecto_id,
        dp.documento_id
      from ${CONTROL_PAGOS_DOCUMENTOS_TABLE} dp
      where dp.tenant_id = $1
        and dp.id = $2
      limit 1
    `,
    [tenantId, documentoProyectoId],
  );

  return result.rows[0] || null;
}

async function fetchDocumentosHito(tenantId) {
  await ensureControlPagosHitoDocumentosSchema();

  const result = await query(
    `
      select
        dh.*,
        h.proyecto_id,
        h.nro_hito,
        p.codigo_proyecto,
        d.id as documento_storage_id,
        d.nombre_archivo,
        d.mime_type,
        d.storage_path
      from ${CONTROL_PAGOS_HITO_DOCUMENTOS_TABLE} dh
      inner join ${CONTROL_PAGOS_HITOS_TABLE} h
        on h.id = dh.hito_pago_id
       and h.tenant_id = dh.tenant_id
      inner join dim_proyecto p
        on p.id = h.proyecto_id
      inner join ${DOCUMENTOS_TABLE} d
        on d.id = dh.documento_id
       and d.tenant_id = dh.tenant_id
      where dh.tenant_id = $1
      order by dh.created_at desc
    `,
    [tenantId],
  );

  return result.rows.map(mapDocumentoHito);
}

async function fetchDocumentoHitoById(tenantId, documentoHitoId) {
  await ensureControlPagosHitoDocumentosSchema();

  const result = await query(
    `
      select
        dh.*,
        h.proyecto_id,
        h.nro_hito,
        p.codigo_proyecto,
        d.id as documento_storage_id,
        d.nombre_archivo,
        d.mime_type,
        d.storage_path
      from ${CONTROL_PAGOS_HITO_DOCUMENTOS_TABLE} dh
      inner join ${CONTROL_PAGOS_HITOS_TABLE} h
        on h.id = dh.hito_pago_id
       and h.tenant_id = dh.tenant_id
      inner join dim_proyecto p
        on p.id = h.proyecto_id
      inner join ${DOCUMENTOS_TABLE} d
        on d.id = dh.documento_id
       and d.tenant_id = dh.tenant_id
      where dh.tenant_id = $1
        and dh.id = $2
      limit 1
    `,
    [tenantId, documentoHitoId],
  );

  return result.rows[0] ? mapDocumentoHito(result.rows[0]) : null;
}

async function fetchDocumentoHitoStorageInfo(tenantId, documentoHitoId) {
  await ensureControlPagosHitoDocumentosSchema();

  const result = await query(
    `
      select
        dh.id,
        dh.hito_pago_id,
        dh.documento_id,
        h.proyecto_id
      from ${CONTROL_PAGOS_HITO_DOCUMENTOS_TABLE} dh
      inner join ${CONTROL_PAGOS_HITOS_TABLE} h
        on h.id = dh.hito_pago_id
       and h.tenant_id = dh.tenant_id
      where dh.tenant_id = $1
        and dh.id = $2
      limit 1
    `,
    [tenantId, documentoHitoId],
  );

  return result.rows[0] || null;
}

function sendErrorResponse(res, error, fallbackMessage) {
  const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;

  res.status(statusCode).json({
    error: error instanceof Error ? error.message : fallbackMessage,
  });
}

function attachAuthToRequest(req, authSession) {
  req.auth = authSession;
  mergeRequestContext({
    auth: authSession,
    tenant: authSession?.activeTenant || null,
  });
}

app.use((req, _res, next) => {
  runWithRequestContext(
    {
      auth: null,
      tenant: null,
    },
    () => next(),
  );
});

app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api') || PUBLIC_API_PATHS.has(req.path)) {
    return next();
  }

  try {
    const authSession = await resolveAppSessionFromRequest(req);

    if (!authSession) {
      if (req.headers.cookie?.includes('rekosol_session=')) {
        res.setHeader('Set-Cookie', clearSessionCookie());
      }

      return res.status(401).json({ error: 'Debes iniciar sesion para acceder a la aplicacion.' });
    }

    attachAuthToRequest(req, authSession);

    if (
      req.path !== '/api/session'
      && req.path !== '/api/session/tenant'
      && !authSession.activeTenantId
    ) {
      return res.status(403).json({
        error: 'Debes seleccionar un tenant activo antes de continuar.',
      });
    }

    next();
  } catch (error) {
    sendErrorResponse(res, error, 'No se pudo validar la sesion actual.');
  }
});

app.post('/api/auth/exchange', async (req, res) => {
  try {
    const payload = authExchangeInputSchema.parse(req.body);
    const appSession = await exchangeAuthTokenForSession(payload.provider, payload.idToken);

    res.setHeader('Set-Cookie', await createSessionCookie(appSession));
    res.json(appSession);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    sendErrorResponse(res, error, 'No se pudo iniciar sesion con el proveedor seleccionado.');
  }
});

app.post('/api/auth/logout', async (_req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.status(204).send();
});

app.get('/api/session', async (req, res) => {
  if (!req.auth) {
    return res.status(401).json({ error: 'No hay una sesion activa.' });
  }

  res.json(req.auth);
});

app.post('/api/session/tenant', async (req, res) => {
  try {
    const payload = sessionTenantInputSchema.parse(req.body);

    if (!req.auth) {
      throw createAuthError('No hay una sesion activa.', 401);
    }

    const appSession = await changeSessionTenant(req.auth, payload.tenantId);

    res.setHeader('Set-Cookie', await createSessionCookie(appSession));
    res.json(appSession);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    sendErrorResponse(res, error, 'No se pudo actualizar el tenant activo.');
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    const tenant = await getTenant();
    const dbCheck = await query('select now() as now');

    res.json({
      ok: true,
      serverTime: dbCheck.rows[0].now,
      tenant,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error desconocido al verificar la base de datos',
    });
  }
});

app.get('/api/bootstrap', async (_req, res) => {
  try {
    const tenant = await getTenant();
    const data = await fetchBootstrapData(tenant.id);

    res.json({
      tenant,
      ...data,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al cargar catalogos',
    });
  }
});

app.get('/api/configuracion', async (_req, res) => {
  try {
    const tenant = await getTenant();
    const data = await fetchConfigurationData(tenant.id);

    res.json({
      tenant,
      ...data,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al cargar configuracion',
    });
  }
});

app.get('/api/usuarios', async (_req, res) => {
  try {
    const tenant = await getTenant();
    const users = await fetchTenantUsers(tenant.id);

    res.json(users);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al cargar usuarios',
    });
  }
});

app.get('/api/asistencia/dashboard', async (req, res) => {
  try {
    const tenant = await getTenant();
    const queryInput = asistenciaDashboardQuerySchema.parse(req.query);
    const dashboard = await fetchAsistenciaDashboard(tenant.id, req.auth?.user?.id || null, {
      days: queryInput.days,
    });

    res.json(dashboard);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Query invalida',
        details: error.flatten(),
      });
    }

    sendErrorResponse(res, error, 'No se pudo cargar el dashboard de asistencia.');
  }
});

app.post('/api/asistencia/marcar', async (req, res) => {
  try {
    if (!req.auth?.user?.id) {
      throw createAuthError('No hay una sesion activa para registrar asistencia.', 401);
    }

    const tenant = await getTenant();
    const payload = asistenciaRegistroInputSchema.parse(req.body);
    const record = await registerAsistenciaMark({
      tenantId: tenant.id,
      userId: req.auth.user.id,
      tipo: payload.tipo,
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracyMeters: payload.accuracyMeters,
    });

    res.status(payload.tipo === 'entrada' ? 201 : 200).json(record);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    sendErrorResponse(res, error, 'No se pudo registrar la asistencia.');
  }
});

app.post('/api/usuarios', async (req, res) => {
  const client = await pool.connect();

  try {
    const tenant = await getTenant();
    const payload = inviteUserInputSchema.parse(req.body);
    const email = normalizeText(payload.email, { lowercase: true });
    const nombre = normalizeNullableText(payload.nombre);
    const rol = normalizeText(payload.rol, { lowercase: true }) || 'member';

    await client.query('begin');

    const existingUserResult = await client.query(
      `
        select id, email, nombre
        from users
        where lower(email) = lower($1)
        limit 1
      `,
      [email],
    );

    const existingUser = existingUserResult.rows[0] || null;

    const userId = existingUser?.id || randomUUID();
    const resolvedName = nombre || existingUser?.nombre || email;
    const upsertedUserResult = await client.query(
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
          nombre = $3,
          updated_at = now()
        returning id
      `,
      [userId, email, resolvedName],
    );

    const targetUserId = upsertedUserResult.rows[0]?.id;

    await client.query(
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
      [randomUUID(), tenant.id, targetUserId, rol],
    );

    const invitedUser = await fetchTenantUserByUserId(
      tenant.id,
      targetUserId,
      (text, params) => client.query(text, params),
    );

    if (!invitedUser) {
      throw createAuthError('No se pudo recuperar el usuario invitado.', 500);
    }

    await client.query('commit');

    res.status(existingUser ? 200 : 201).json(invitedUser);
  } catch (error) {
    await client.query('rollback');

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    sendErrorResponse(res, error, 'No se pudo invitar al usuario.');
  } finally {
    client.release();
  }
});

app.post('/api/proyectos', async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = proyectoInputSchema.parse(req.body);
    const activeColumn = await getActiveColumnName('dim_proyecto');
    const columns = [
      'id',
      'tenant_id',
      'nombre',
      'codigo_proyecto',
      'monto_total_proyecto',
      'moneda_base',
    ];
    const values = [
      randomUUID(),
      tenant.id,
      normalizeText(payload.nombre, { uppercase: true }),
      normalizeNullableText(payload.codigoProyecto, { uppercase: true }),
      normalizeNumeric(payload.montoTotalProyecto),
      normalizeNullableText(payload.monedaBase, { uppercase: true }),
    ];

    if (activeColumn) {
      columns.push(activeColumn);
      values.push(true);
    }

    const result = await query(
      `
        insert into dim_proyecto (
          ${columns.join(', ')}
        )
        values (${values.map((_, index) => `$${index + 1}`).join(', ')})
        returning *
      `,
      values,
    );

    res.status(201).json(mapProyecto(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al crear proyecto',
    });
  }
});

app.put('/api/proyectos/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = proyectoInputSchema.extend({
      activo: z.boolean().optional().nullable(),
    }).parse(req.body);
    const activeColumn = await getActiveColumnName('dim_proyecto');
    const values = [
      tenant.id,
      req.params.id,
      normalizeText(payload.nombre, { uppercase: true }),
      normalizeNullableText(payload.codigoProyecto, { uppercase: true }),
      normalizeNumeric(payload.montoTotalProyecto),
      normalizeNullableText(payload.monedaBase, { uppercase: true }),
    ];

    let activeFragment = '';
    if (activeColumn) {
      activeFragment = `,\n          ${activeColumn} = $7`;
      values.push(payload.activo ?? true);
    }

    const result = await query(
      `
        update dim_proyecto
        set
          nombre = $3,
          codigo_proyecto = $4,
          monto_total_proyecto = $5,
          moneda_base = $6${activeFragment},
          updated_at = now()
        where tenant_id = $1
          and id = $2
        returning *
      `,
      values,
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    res.json(mapProyecto(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al actualizar proyecto',
    });
  }
});

app.delete('/api/proyectos/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    const result = await deactivateOrDeleteDimension(tenant.id, 'dim_proyecto', req.params.id);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    res.status(204).send();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23503') {
      return res.status(409).json({
        error: 'No se puede eliminar el proyecto porque tiene registros relacionados.',
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al eliminar proyecto',
    });
  }
});

app.post('/api/categorias', async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = categoriaInputSchema.parse(req.body);
    const nombre = normalizeText(payload.nombre, { uppercase: true });
    const activeColumn = await getActiveColumnName('dim_categoria');
    const columns = ['id', 'tenant_id', 'nombre', 'color'];
    const values = [
      randomUUID(),
      tenant.id,
      nombre,
      normalizeNullableText(payload.color) || getCategoryColor(nombre),
    ];

    if (activeColumn) {
      columns.push(activeColumn);
      values.push(true);
    }

    const result = await query(
      `
        insert into dim_categoria (
          ${columns.join(', ')}
        )
        values (${values.map((_, index) => `$${index + 1}`).join(', ')})
        returning *
      `,
      values,
    );

    res.status(201).json(mapCategoria(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al crear categoria',
    });
  }
});

app.put('/api/categorias/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = categoriaInputSchema.extend({
      activa: z.boolean().optional().nullable(),
    }).parse(req.body);
    const activeColumn = await getActiveColumnName('dim_categoria');
    const values = [
      tenant.id,
      req.params.id,
      normalizeText(payload.nombre, { uppercase: true }),
      normalizeNullableText(payload.color),
    ];

    let activeFragment = '';
    if (activeColumn) {
      activeFragment = `,\n          ${activeColumn} = $5`;
      values.push(payload.activa ?? true);
    }

    const result = await query(
      `
        update dim_categoria
        set
          nombre = $3,
          color = $4${activeFragment},
          updated_at = now()
        where tenant_id = $1
          and id = $2
        returning *
      `,
      values,
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Categoria no encontrada' });
    }

    res.json(mapCategoria(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al actualizar categoria',
    });
  }
});

app.delete('/api/categorias/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    const result = await deactivateOrDeleteDimension(tenant.id, 'dim_categoria', req.params.id);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Categoria no encontrada' });
    }

    res.status(204).send();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23503') {
      return res.status(409).json({
        error: 'No se puede eliminar la categoria porque tiene registros relacionados.',
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al eliminar categoria',
    });
  }
});

app.post('/api/empresas', async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = empresaInputSchema.parse(req.body);
    const activeColumn = await getActiveColumnName('dim_empresa');
    const columns = [
      'id',
      'tenant_id',
      'razon_social',
      'rut',
      'numero_contacto',
      'correo_electronico',
      'categoria',
    ];
    const values = [
      randomUUID(),
      tenant.id,
      normalizeText(payload.razonSocial, { uppercase: true }),
      normalizeNullableText(payload.rut, { uppercase: true }),
      normalizeNullableText(payload.numeroContacto),
      normalizeNullableText(payload.correoElectronico, { lowercase: true }),
      normalizeNullableText(payload.categoria),
    ];

    if (activeColumn) {
      columns.push(activeColumn);
      values.push(true);
    }

    const result = await query(
      `
        insert into dim_empresa (
          ${columns.join(', ')}
        )
        values (${values.map((_, index) => `$${index + 1}`).join(', ')})
        returning *
      `,
      values,
    );

    res.status(201).json(mapEmpresa(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al crear empresa',
    });
  }
});

app.put('/api/empresas/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = empresaInputSchema.extend({
      activo: z.boolean().optional().nullable(),
    }).parse(req.body);
    const activeColumn = await getActiveColumnName('dim_empresa');
    const values = [
      tenant.id,
      req.params.id,
      normalizeText(payload.razonSocial, { uppercase: true }),
      normalizeNullableText(payload.rut, { uppercase: true }),
      normalizeNullableText(payload.numeroContacto),
      normalizeNullableText(payload.correoElectronico, { lowercase: true }),
      normalizeNullableText(payload.categoria),
    ];

    let activeFragment = '';
    if (activeColumn) {
      activeFragment = `,\n          ${activeColumn} = $8`;
      values.push(payload.activo ?? true);
    }

    const result = await query(
      `
        update dim_empresa
        set
          razon_social = $3,
          rut = $4,
          numero_contacto = $5,
          correo_electronico = $6,
          categoria = $7${activeFragment},
          updated_at = now()
        where tenant_id = $1
          and id = $2
        returning *
      `,
      values,
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    res.json(mapEmpresa(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al actualizar empresa',
    });
  }
});

app.delete('/api/empresas/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    const result = await deactivateOrDeleteDimension(tenant.id, 'dim_empresa', req.params.id);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    res.status(204).send();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23503') {
      return res.status(409).json({
        error: 'No se puede eliminar la empresa porque tiene registros relacionados.',
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al eliminar empresa',
    });
  }
});

app.post('/api/colaboradores', async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = colaboradorInputSchema.parse(req.body);
    const activeColumn = await getActiveColumnName('dim_colaborador');
    const columns = ['id', 'tenant_id', 'nombre', 'email', 'telefono', 'cargo'];
    const values = [
      randomUUID(),
      tenant.id,
      normalizeText(payload.nombre, { uppercase: true }),
      normalizeNullableText(payload.email, { lowercase: true }),
      normalizeNullableText(payload.telefono),
      normalizeNullableText(payload.cargo, { uppercase: true }),
    ];

    if (activeColumn) {
      columns.push(activeColumn);
      values.push(true);
    }

    const result = await query(
      `
        insert into dim_colaborador (
          ${columns.join(', ')}
        )
        values (${values.map((_, index) => `$${index + 1}`).join(', ')})
        returning *
      `,
      values,
    );

    res.status(201).json(mapColaborador(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al crear colaborador',
    });
  }
});

app.put('/api/colaboradores/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = colaboradorInputSchema.extend({
      activo: z.boolean().optional().nullable(),
    }).parse(req.body);
    const activeColumn = await getActiveColumnName('dim_colaborador');
    const values = [
      tenant.id,
      req.params.id,
      normalizeText(payload.nombre, { uppercase: true }),
      normalizeNullableText(payload.email, { lowercase: true }),
      normalizeNullableText(payload.telefono),
      normalizeNullableText(payload.cargo, { uppercase: true }),
    ];

    let activeFragment = '';
    if (activeColumn) {
      activeFragment = `,\n          ${activeColumn} = $7`;
      values.push(payload.activo ?? true);
    }

    const result = await query(
      `
        update dim_colaborador
        set
          nombre = $3,
          email = $4,
          telefono = $5,
          cargo = $6${activeFragment},
          updated_at = now()
        where tenant_id = $1
          and id = $2
        returning *
      `,
      values,
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Colaborador no encontrado' });
    }

    res.json(mapColaborador(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al actualizar colaborador',
    });
  }
});

app.delete('/api/colaboradores/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    const result = await deactivateOrDeleteDimension(tenant.id, 'dim_colaborador', req.params.id);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Colaborador no encontrado' });
    }

    res.status(204).send();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23503') {
      return res.status(409).json({
        error: 'No se puede eliminar el colaborador porque tiene registros relacionados.',
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al eliminar colaborador',
    });
  }
});

app.post('/api/tipos-documento', async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = tipoDocumentoInputSchema.parse(req.body);
    const activeColumn = await getActiveColumnName('dim_tipo_documento');
    const columns = ['id', 'tenant_id', 'nombre', 'descripcion'];
    const values = [
      randomUUID(),
      tenant.id,
      normalizeText(payload.nombre, { uppercase: true }),
      normalizeNullableText(payload.descripcion, { uppercase: true }),
    ];

    if (activeColumn) {
      columns.push(activeColumn);
      values.push(payload.activo ?? true);
    }

    const result = await query(
      `
        insert into dim_tipo_documento (
          ${columns.join(', ')}
        )
        values (${values.map((_, index) => `$${index + 1}`).join(', ')})
        returning *
      `,
      values,
    );

    res.status(201).json(mapTipoDocumento(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al crear tipo de documento',
    });
  }
});

app.put('/api/tipos-documento/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = tipoDocumentoInputSchema.parse(req.body);
    const activeColumn = await getActiveColumnName('dim_tipo_documento');
    const values = [
      tenant.id,
      req.params.id,
      normalizeText(payload.nombre, { uppercase: true }),
      normalizeNullableText(payload.descripcion, { uppercase: true }),
    ];

    let activeFragment = '';
    if (activeColumn) {
      activeFragment = `,\n          ${activeColumn} = $5`;
      values.push(payload.activo ?? true);
    }

    const result = await query(
      `
        update dim_tipo_documento
        set
          nombre = $3,
          descripcion = $4${activeFragment},
          updated_at = now()
        where tenant_id = $1
          and id = $2
        returning *
      `,
      values,
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Tipo de documento no encontrado' });
    }

    res.json(mapTipoDocumento(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al actualizar tipo de documento',
    });
  }
});

app.delete('/api/tipos-documento/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    const result = await deactivateOrDeleteDimension(tenant.id, 'dim_tipo_documento', req.params.id);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Tipo de documento no encontrado' });
    }

    res.status(204).send();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23503') {
      return res.status(409).json({
        error: 'No se puede eliminar el tipo de documento porque tiene registros relacionados.',
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al eliminar tipo de documento',
    });
  }
});

app.post('/api/tipos-documento-proyecto', async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = tipoDocumentoProyectoInputSchema.parse(req.body);
    const activeColumn = await getActiveColumnName('dim_tipo_documento_proyecto');
    const columns = ['id', 'tenant_id', 'nombre', 'descripcion'];
    const values = [
      randomUUID(),
      tenant.id,
      normalizeText(payload.nombre, { uppercase: true }),
      normalizeNullableText(payload.descripcion, { uppercase: true }),
    ];

    if (activeColumn) {
      columns.push(activeColumn);
      values.push(payload.activo ?? true);
    }

    const result = await query(
      `
        insert into dim_tipo_documento_proyecto (
          ${columns.join(', ')}
        )
        values (${values.map((_, index) => `$${index + 1}`).join(', ')})
        returning *
      `,
      values,
    );

    res.status(201).json(mapTipoDocumentoProyecto(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al crear documento de proyecto',
    });
  }
});

app.put('/api/tipos-documento-proyecto/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = tipoDocumentoProyectoInputSchema.parse(req.body);
    const activeColumn = await getActiveColumnName('dim_tipo_documento_proyecto');
    const values = [
      tenant.id,
      req.params.id,
      normalizeText(payload.nombre, { uppercase: true }),
      normalizeNullableText(payload.descripcion, { uppercase: true }),
    ];

    let activeFragment = '';
    if (activeColumn) {
      activeFragment = `,\n          ${activeColumn} = $5`;
      values.push(payload.activo ?? true);
    }

    const result = await query(
      `
        update dim_tipo_documento_proyecto
        set
          nombre = $3,
          descripcion = $4${activeFragment},
          updated_at = now()
        where tenant_id = $1
          and id = $2
        returning *
      `,
      values,
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Documento de proyecto no encontrado' });
    }

    res.json(mapTipoDocumentoProyecto(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al actualizar documento de proyecto',
    });
  }
});

app.delete('/api/tipos-documento-proyecto/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    const result = await deactivateOrDeleteDimension(tenant.id, 'dim_tipo_documento_proyecto', req.params.id);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Documento de proyecto no encontrado' });
    }

    res.status(204).send();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23503') {
      return res.status(409).json({
        error: 'No se puede eliminar el documento de proyecto porque tiene registros relacionados.',
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al eliminar documento de proyecto',
    });
  }
});

app.get('/api/control-pagos/hitos', async (_req, res) => {
  try {
    const tenant = await getTenant();
    const hitos = await fetchHitosPagoProyecto(tenant.id);
    res.json(hitos);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al cargar hitos de pago',
    });
  }
});

app.post('/api/control-pagos/hitos', async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = hitoPagoProyectoInputSchema.parse(req.body);
    await ensureControlPagosHitosSchema();
    const nroHito = payload.nroHito ?? await getNextHitoNumber(tenant.id, payload.proyectoId);
    const facturado = payload.facturado ?? false;
    const pagado = payload.pagado ?? false;

    const result = await query(
      `
        insert into ${CONTROL_PAGOS_HITOS_TABLE} (
          id,
          tenant_id,
          proyecto_id,
          nombre,
          descripcion,
          fecha_compromiso,
          fecha_pago,
          monto,
          estado,
          nro_hito,
          moneda,
          facturado,
          pagado,
          observacion
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        returning id
      `,
      [
        randomUUID(),
        tenant.id,
        payload.proyectoId,
        `HITO ${nroHito}`,
        normalizeNullableText(payload.observacion, { uppercase: true }),
        toNullable(payload.fechaCompromiso),
        toNullable(payload.fechaPago),
        normalizeNumeric(payload.montoHito),
        getHitoEstado({ facturado, pagado }),
        nroHito,
        normalizeNullableText(payload.moneda, { uppercase: true }) || 'CLP',
        facturado,
        pagado,
        normalizeNullableText(payload.observacion, { uppercase: true }),
      ],
    );
    res.status(201).json(await fetchHitoPagoProyectoById(tenant.id, result.rows[0].id));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return res.status(409).json({
        error: 'Ya existe un hito con ese numero para el proyecto seleccionado.',
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al crear hito de pago',
    });
  }
});

app.put('/api/control-pagos/hitos/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = hitoPagoProyectoInputSchema.parse(req.body);
    const existing = await fetchHitoPagoProyectoById(tenant.id, req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Hito no encontrado' });
    }

    const facturado = payload.facturado ?? false;
    const pagado = payload.pagado ?? false;
    const proyectoChanged = String(existing.proyectoId) !== String(payload.proyectoId);
    const nroHito = payload.nroHito
      ?? (proyectoChanged ? await getNextHitoNumber(tenant.id, payload.proyectoId) : existing.nroHito);

    await query(
      `
        update ${CONTROL_PAGOS_HITOS_TABLE}
        set
          proyecto_id = $3,
          nombre = $4,
          descripcion = $5,
          fecha_compromiso = $6,
          fecha_pago = $7,
          monto = $8,
          estado = $9,
          nro_hito = $10,
          moneda = $11,
          facturado = $12,
          pagado = $13,
          observacion = $14,
          updated_at = now()
        where tenant_id = $1
          and id = $2
      `,
      [
        tenant.id,
        req.params.id,
        payload.proyectoId,
        `HITO ${nroHito}`,
        normalizeNullableText(payload.observacion, { uppercase: true }),
        toNullable(payload.fechaCompromiso),
        toNullable(payload.fechaPago),
        normalizeNumeric(payload.montoHito),
        getHitoEstado({ facturado, pagado }),
        nroHito,
        normalizeNullableText(payload.moneda, { uppercase: true }) || 'CLP',
        facturado,
        pagado,
        normalizeNullableText(payload.observacion, { uppercase: true }),
      ],
    );

    res.json(await fetchHitoPagoProyectoById(tenant.id, req.params.id));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return res.status(409).json({
        error: 'Ya existe un hito con ese numero para el proyecto seleccionado.',
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al actualizar hito de pago',
    });
  }
});

app.delete('/api/control-pagos/hitos/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    await ensureControlPagosHitoDocumentosSchema();

    const existing = await fetchHitoPagoProyectoById(tenant.id, req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Hito no encontrado' });
    }

    const client = await pool.connect();
    let removedDocumentRows = [];

    try {
      await client.query('begin');

      const linkedDocumentsResult = await client.query(
        `
          select documento_id
          from ${CONTROL_PAGOS_HITO_DOCUMENTOS_TABLE}
          where tenant_id = $1
            and hito_pago_id = $2
        `,
        [tenant.id, req.params.id],
      );

      await client.query(
        `
          delete from ${CONTROL_PAGOS_HITO_DOCUMENTOS_TABLE}
          where tenant_id = $1
            and hito_pago_id = $2
        `,
        [tenant.id, req.params.id],
      );

      removedDocumentRows = await deleteStoredDocumentsByIds(
        (text, params) => client.query(text, params),
        tenant.id,
        linkedDocumentsResult.rows
          .map((row) => row.documento_id)
          .filter(Boolean),
      );

      await client.query(
        `
          delete from ${CONTROL_PAGOS_HITOS_TABLE}
          where tenant_id = $1
            and id = $2
        `,
        [tenant.id, req.params.id],
      );

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    await cleanupStorageObjects(removedDocumentRows);

    res.status(204).send();
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al eliminar hito de pago',
    });
  }
});

app.get('/api/control-pagos/documentos-hito', async (_req, res) => {
  try {
    const tenant = await getTenant();
    const documentos = await fetchDocumentosHito(tenant.id);
    res.json(documentos);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al cargar documentos de hito',
    });
  }
});

app.post('/api/control-pagos/documentos-hito', maybeHandleDocumentoHitoUpload, async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = documentoHitoInputSchema.parse(parseMultipartPayload(req));
    const hito = await fetchHitoPagoProyectoById(tenant.id, payload.hitoPagoId);

    if (!hito) {
      return res.status(404).json({ error: 'Hito no encontrado' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Debes adjuntar un archivo.' });
    }

    const uploadedDocument = await uploadBufferToStorage({
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      folder: 'pagos-hitos',
      projectId: hito.proyectoId,
      recordId: payload.hitoPagoId,
    });

    const relationId = randomUUID();
    const client = await pool.connect();

    try {
      await client.query('begin');

      const documentoId = await createDocumentoRecord(
        (text, params) => client.query(text, params),
        tenant.id,
        uploadedDocument,
      );

      await client.query(
        `
          insert into ${CONTROL_PAGOS_HITO_DOCUMENTOS_TABLE} (
            id,
            tenant_id,
            hito_pago_id,
            documento_id
          )
          values ($1, $2, $3, $4)
        `,
        [relationId, tenant.id, payload.hitoPagoId, documentoId],
      );

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      await cleanupStorageObjects([uploadedDocument]);
      throw error;
    } finally {
      client.release();
    }

    res.status(201).json(await fetchDocumentoHitoById(tenant.id, relationId));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `El archivo supera el limite de ${MAX_GASTO_ATTACHMENT_SIZE_MB} MB`,
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al crear documento de hito',
    });
  }
});

app.delete('/api/control-pagos/documentos-hito/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    const existing = await fetchDocumentoHitoStorageInfo(tenant.id, req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Documento de hito no encontrado' });
    }

    const client = await pool.connect();
    let removedDocumentRows = [];

    try {
      await client.query('begin');

      await client.query(
        `
          delete from ${CONTROL_PAGOS_HITO_DOCUMENTOS_TABLE}
          where tenant_id = $1
            and id = $2
        `,
        [tenant.id, req.params.id],
      );

      removedDocumentRows = await deleteStoredDocumentsByIds(
        (text, params) => client.query(text, params),
        tenant.id,
        existing.documento_id ? [existing.documento_id] : [],
      );

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    await cleanupStorageObjects(removedDocumentRows);

    res.status(204).send();
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al eliminar documento de hito',
    });
  }
});

app.get('/api/control-pagos/documentos', async (_req, res) => {
  try {
    const tenant = await getTenant();
    const documentos = await fetchDocumentosProyecto(tenant.id);
    res.json(documentos);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al cargar documentos de proyecto',
    });
  }
});

app.post('/api/control-pagos/documentos', maybeHandleDocumentoProyectoUpload, async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = documentoProyectoInputSchema.parse(parseMultipartPayload(req));
    await ensureControlPagosDocumentosSchema();

    if (!req.file) {
      return res.status(400).json({ error: 'Debes adjuntar exactamente 1 archivo.' });
    }

    const documentoProyectoId = randomUUID();
    const uploadedDocument = await uploadBufferToStorage({
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      folder: 'proyectos',
      projectId: payload.proyectoId,
      recordId: documentoProyectoId,
    });

    const client = await pool.connect();

    try {
      await client.query('begin');

      const documentoId = await createDocumentoRecord(
        (text, params) => client.query(text, params),
        tenant.id,
        uploadedDocument,
      );

      await client.query(
        `
          insert into ${CONTROL_PAGOS_DOCUMENTOS_TABLE} (
            id,
            tenant_id,
            proyecto_id,
            documento_id,
            tipo_documento_id,
            fecha_documento,
            nro_referencia,
            observacion
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          documentoProyectoId,
          tenant.id,
          payload.proyectoId,
          documentoId,
          payload.tipoDocumentoProyectoId,
          toNullable(payload.fechaDocumento),
          normalizeNullableText(payload.nroReferencia, { uppercase: true }),
          normalizeNullableText(payload.observacion, { uppercase: true }),
        ],
      );

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      await cleanupStorageObjects([uploadedDocument]);
      throw error;
    } finally {
      client.release();
    }

    res.status(201).json(await fetchDocumentoProyectoById(tenant.id, documentoProyectoId));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `El archivo supera el limite de ${MAX_GASTO_ATTACHMENT_SIZE_MB} MB`,
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al crear documento de proyecto',
    });
  }
});

app.put('/api/control-pagos/documentos/:id', maybeHandleDocumentoProyectoUpload, async (req, res) => {
  try {
    const tenant = await getTenant();
    const payload = documentoProyectoInputSchema.parse(parseMultipartPayload(req));
    await ensureControlPagosDocumentosSchema();
    const existing = await fetchDocumentoProyectoStorageInfo(tenant.id, req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    let uploadedDocument = null;
    if (req.file) {
      uploadedDocument = await uploadBufferToStorage({
        buffer: req.file.buffer,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        folder: 'proyectos',
        projectId: payload.proyectoId,
        recordId: req.params.id,
      });
    }

    const client = await pool.connect();
    let removedDocumentRows = [];

    try {
      await client.query('begin');

      let nextDocumentoId = existing.documento_id;
      if (uploadedDocument) {
        nextDocumentoId = await createDocumentoRecord(
          (text, params) => client.query(text, params),
          tenant.id,
          uploadedDocument,
        );
      }

      await client.query(
        `
          update ${CONTROL_PAGOS_DOCUMENTOS_TABLE}
          set
            proyecto_id = $3,
            documento_id = $4,
            tipo_documento_id = $5,
            fecha_documento = $6,
            nro_referencia = $7,
            observacion = $8,
            updated_at = now()
          where tenant_id = $1
            and id = $2
        `,
        [
          tenant.id,
          req.params.id,
          payload.proyectoId,
          nextDocumentoId,
          payload.tipoDocumentoProyectoId,
          toNullable(payload.fechaDocumento),
          normalizeNullableText(payload.nroReferencia, { uppercase: true }),
          normalizeNullableText(payload.observacion, { uppercase: true }),
        ],
      );

      if (uploadedDocument && existing.documento_id) {
        removedDocumentRows = await deleteStoredDocumentsByIds(
          (text, params) => client.query(text, params),
          tenant.id,
          [existing.documento_id],
        );
      }

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      if (uploadedDocument) {
        await cleanupStorageObjects([uploadedDocument]);
      }
      throw error;
    } finally {
      client.release();
    }

    await cleanupStorageObjects(removedDocumentRows);

    res.json(await fetchDocumentoProyectoById(tenant.id, req.params.id));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `El archivo supera el limite de ${MAX_GASTO_ATTACHMENT_SIZE_MB} MB`,
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al actualizar documento de proyecto',
    });
  }
});

app.delete('/api/control-pagos/documentos/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    const existing = await fetchDocumentoProyectoStorageInfo(tenant.id, req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    const client = await pool.connect();
    let removedDocumentRows = [];

    try {
      await client.query('begin');

      await client.query(
        `
          delete from ${CONTROL_PAGOS_DOCUMENTOS_TABLE}
          where tenant_id = $1
            and id = $2
        `,
        [tenant.id, req.params.id],
      );

      removedDocumentRows = await deleteStoredDocumentsByIds(
        (text, params) => client.query(text, params),
        tenant.id,
        existing.documento_id ? [existing.documento_id] : [],
      );

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    await cleanupStorageObjects(removedDocumentRows);

    res.status(204).send();
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al eliminar documento de proyecto',
    });
  }
});

app.get('/api/gastos', async (_req, res) => {
  try {
    const tenant = await getTenant();
    const gastos = await fetchGastos(tenant.id);
    res.json(gastos);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al cargar gastos',
    });
  }
});

app.get('/api/documentos/:id/contenido', async (req, res) => {
  try {
    const tenant = await getTenant();
    const documento = await fetchStoredDocumentById(tenant.id, req.params.id);

    if (!documento) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    const storedContent = await readStoredDocumentContent(documento);
    const encodedName = encodeURIComponent(documento.nombre_archivo);

    res.setHeader('Content-Type', storedContent.contentType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedName}`);
    res.setHeader('Cache-Control', 'private, max-age=0, no-transform');

    if (storedContent.contentLength) {
      res.setHeader('Content-Length', String(storedContent.contentLength));
    }

    res.end(storedContent.buffer);
  } catch (error) {
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Error al descargar documento',
    });
  }
});

app.post('/api/gastos', maybeHandleMultipartUploads, async (req, res) => {
  try {
    const tenant = await getTenant();
    await ensureGastoDocumentosSchema();

    const payload = gastoInputSchema.parse(parseGastoPayload(req));
    const montoTotal = normalizeNumeric(payload.montoTotal ?? payload.monto);
    const uploadedFilesInput = Array.isArray(req.files) ? req.files : [];

    if (montoTotal === null) {
      return res.status(400).json({ error: 'montoTotal es obligatorio' });
    }

    const gastoId = randomUUID();
    const uploadedFiles = [];

    for (const file of uploadedFilesInput) {
      uploadedFiles.push(await uploadBufferToStorage({
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        folder: 'gastos',
        projectId: payload.proyectoId,
        recordId: gastoId,
      }));
    }

    const client = await pool.connect();

    try {
      await client.query('begin');

      await client.query(
        `
          insert into fct_gasto (
            id,
            tenant_id,
            fecha,
            empresa_id,
            categoria_id,
            tipo_documento_id,
            numero_documento,
            monto_neto,
            iva,
            monto_total,
            detalle,
            proyecto_id,
            colaborador_id,
            comentario_tipo_documento
          )
          values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
          )
        `,
        [
          gastoId,
          tenant.id,
          payload.fecha,
          payload.empresaId,
          toNullable(payload.categoria),
          toNullable(payload.tipoDocumento),
          payload.numeroDocumento ?? '',
          normalizeNumeric(payload.montoNeto),
          normalizeNumeric(payload.iva),
          montoTotal,
          toNullable(payload.detalle),
          toNullable(payload.proyectoId),
          toNullable(payload.colaboradorId),
          toNullable(payload.comentarioTipoDocumento),
        ],
      );

      await attachUploadedFilesToGasto((text, params) => client.query(text, params), tenant.id, gastoId, uploadedFiles);

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      await cleanupStorageObjects(uploadedFiles);
      throw error;
    } finally {
      client.release();
    }

    const created = await fetchGastoById(tenant.id, gastoId);
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `Uno de los archivos supera el limite de ${MAX_GASTO_ATTACHMENT_SIZE_MB} MB`,
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al crear gasto',
    });
  }
});

app.put('/api/gastos/:id', maybeHandleMultipartUploads, async (req, res) => {
  try {
    const tenant = await getTenant();
    await ensureGastoDocumentosSchema();

    const payload = gastoInputSchema.parse(parseGastoPayload(req));
    const montoTotal = normalizeNumeric(payload.montoTotal ?? payload.monto);
    const uploadedFilesInput = Array.isArray(req.files) ? req.files : [];

    if (montoTotal === null) {
      return res.status(400).json({ error: 'montoTotal es obligatorio' });
    }

    const uploadedFiles = [];

    for (const file of uploadedFilesInput) {
      uploadedFiles.push(await uploadBufferToStorage({
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        folder: 'gastos',
        projectId: payload.proyectoId,
        recordId: req.params.id,
      }));
    }

    const client = await pool.connect();
    let removedDocumentRows = [];

    try {
      await client.query('begin');

      const updateResult = await client.query(
        `
          update fct_gasto
          set
            fecha = $3,
            empresa_id = $4,
            categoria_id = $5,
            tipo_documento_id = $6,
            numero_documento = $7,
            monto_neto = $8,
            iva = $9,
            monto_total = $10,
            detalle = $11,
            proyecto_id = $12,
            colaborador_id = $13,
            comentario_tipo_documento = $14,
            updated_at = now()
          where tenant_id = $1
            and id = $2
        `,
        [
          tenant.id,
          req.params.id,
          payload.fecha,
          payload.empresaId,
          toNullable(payload.categoria),
          toNullable(payload.tipoDocumento),
          payload.numeroDocumento ?? '',
          normalizeNumeric(payload.montoNeto),
          normalizeNumeric(payload.iva),
          montoTotal,
          toNullable(payload.detalle),
          toNullable(payload.proyectoId),
          toNullable(payload.colaboradorId),
          toNullable(payload.comentarioTipoDocumento),
        ],
      );

      if (updateResult.rowCount === 0) {
        await client.query('rollback');
        await cleanupStorageObjects(uploadedFiles);
        return res.status(404).json({ error: 'Gasto no encontrado' });
      }

      const currentDocuments = await fetchGastoDocumentos(
        tenant.id,
        req.params.id,
        (text, params) => client.query(text, params),
      );
      const keepIds = new Set(payload.existingAttachmentIds || []);
      const documentIdsToRemove = currentDocuments
        .filter((documento) => !keepIds.has(documento.id))
        .map((documento) => documento.id);

      removedDocumentRows = await removeGastoDocumentos(
        (text, params) => client.query(text, params),
        tenant.id,
        req.params.id,
        documentIdsToRemove,
      );

      await attachUploadedFilesToGasto(
        (text, params) => client.query(text, params),
        tenant.id,
        req.params.id,
        uploadedFiles,
      );

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      await cleanupStorageObjects(uploadedFiles);
      throw error;
    } finally {
      client.release();
    }

    await cleanupStorageObjects(removedDocumentRows);

    const updated = await fetchGastoById(tenant.id, req.params.id);
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Payload invalido',
        details: error.flatten(),
      });
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `Uno de los archivos supera el limite de ${MAX_GASTO_ATTACHMENT_SIZE_MB} MB`,
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al actualizar gasto',
    });
  }
});

app.delete('/api/gastos/:id', async (req, res) => {
  try {
    const tenant = await getTenant();
    await ensureGastoDocumentosSchema();

    const client = await pool.connect();
    let removedDocumentRows = [];
    let deleteResult;

    try {
      await client.query('begin');

      const currentDocuments = await fetchGastoDocumentos(
        tenant.id,
        req.params.id,
        (text, params) => client.query(text, params),
      );

      removedDocumentRows = await removeGastoDocumentos(
        (text, params) => client.query(text, params),
        tenant.id,
        req.params.id,
        currentDocuments.map((documento) => documento.id),
      );

      deleteResult = await client.query(
        `
          delete from fct_gasto
          where tenant_id = $1
            and id = $2
        `,
        [tenant.id, req.params.id],
      );

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    await cleanupStorageObjects(removedDocumentRows);

    res.status(204).send();
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al eliminar gasto',
    });
  }
});

async function registerFrontend() {
  if (isProduction) {
    app.use(express.static(distDir, { index: false }));
  } else {
    const { createServer } = await import('vite');
    viteDevServer = await createServer({
      root: rootDir,
      appType: 'custom',
      server: {
        middlewareMode: true,
      },
    });

    app.use(viteDevServer.middlewares);
  }

  app.use(async (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      return next();
    }

    try {
      const indexPath = isProduction
        ? path.resolve(distDir, 'index.html')
        : path.resolve(rootDir, 'index.html');

      let template = await fs.readFile(indexPath, 'utf-8');

      if (!isProduction && viteDevServer) {
        template = await viteDevServer.transformIndexHtml(req.originalUrl, template);
      }

      res.status(200).setHeader('Content-Type', 'text/html').end(template);
    } catch (error) {
      if (viteDevServer && error instanceof Error) {
        viteDevServer.ssrFixStacktrace(error);
      }

      next(error);
    }
  });
}

async function warmStartupDependencies() {
  try {
    await ensureCoreSchema();
    if (isDevAuthBypassEnabled()) {
      await ensureDevSeedData();
    }
    await ensureUserAuthIdentitiesSchema();
    await ensureControlPagosHitosSchema();
    await ensureControlPagosDocumentosSchema();
    await ensureAsistenciaSchema();
    console.log('Inicializacion de esquemas completada correctamente.');
  } catch (error) {
    console.error(
      'No se pudo completar la inicializacion de base de datos al arranque. Se reintentara bajo demanda.',
      error,
    );
  }
}

async function primeDatabaseStartupState() {
  try {
    await ensureCoreSchema();

    if (isDevAuthBypassEnabled()) {
      await ensureDevSeedData();
    }
  } catch (error) {
    console.error(
      'No se pudo preparar el esquema base al arranque. Se intentara nuevamente al resolver la primera sesion o request.',
      error,
    );
  }
}

await primeDatabaseStartupState();

try {
  await registerFrontend();
} catch (error) {
  console.error('No se pudo registrar el frontend para produccion.', error);
  process.exit(1);
}

const listenHost = process.env.HOST || '0.0.0.0';
const port = await resolveListenPort(preferredPort, listenHost);

const server = app.listen(port, listenHost, () => {
  console.log(`Servidor web + API escuchando en http://${listenHost}:${port}`);

  if (port !== preferredPort) {
    console.warn(`Puerto ${preferredPort} ocupado. Se uso automaticamente el puerto ${port}.`);
  }

  console.log('Autenticacion habilitada: Microsoft + Google + sesiones HTTP + tenant por request');
  console.log(
    hasRemoteStorageConfig
      ? `Storage adjuntos: remoto (${STORAGE_API_URL})`
      : `Storage adjuntos: local (${localStorageRootDir})`,
  );

  if (hasPartialRemoteStorageConfig && !hasRemoteStorageConfig) {
    console.warn('Storage remoto incompleto: se usara almacenamiento local para los adjuntos.');
  }

  if (isDevAuthBypassEnabled()) {
    const devAuthDetails = getDevAuthBypassDetails();
    console.log(
      `Sesion de desarrollo habilitada: ${devAuthDetails.userEmail} -> tenant ${devAuthDetails.tenantSlug}`,
    );
  }

  void warmStartupDependencies();
});

server.on('error', (error) => {
  console.error('Error al iniciar el servidor HTTP:', error);
  process.exit(1);
});

const shutdown = async () => {
  server.close(async () => {
    if (viteDevServer) {
      await viteDevServer.close();
    }
    await closePool();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

pool.on('error', (error) => {
  console.error('Error inesperado del pool PostgreSQL:', error);
});
