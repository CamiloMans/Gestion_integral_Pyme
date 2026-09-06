import type { Colaborador, Empresa, Gasto, Proyecto } from '@/data/mockData';
import type { PermissionKey } from '@/lib/access-control';

type AuthProvider = 'microsoft' | 'google';

type TenantInfo = {
  id: string;
  slug: string;
  nombre: string;
};

type SessionUser = {
  id: string;
  email: string;
  nombre: string;
  authProvider?: AuthProvider | null;
  authProviders?: AuthProvider[];
};

type TenantMembership = {
  id: string;
  tenantId: string;
  rol: string;
  estado: string;
  permissions: PermissionKey[];
  tenant: TenantInfo;
};

type TenantUser = {
  id: string;
  membershipId: string;
  tenantId: string;
  email: string;
  nombre: string;
  authProvider?: AuthProvider | null;
  authProviders: AuthProvider[];
  authLinked: boolean;
  invitationState: 'pendiente' | 'vinculado';
  role: string;
  estado: string;
  createdAt?: string;
  updatedAt?: string;
  permissions: PermissionKey[];
};

type AppSession = {
  user: SessionUser;
  memberships: TenantMembership[];
  activeTenantId: string | null;
  activeTenant: TenantInfo | null;
  role: string | null;
  permissions: PermissionKey[];
};

type CategoriaOption = {
  id: string;
  nombre: string;
  color?: string;
  activa?: boolean;
};

type TipoDocumentoOption = {
  id: string;
  nombre: string;
  descripcion?: string;
  activo?: boolean;
  tieneImpuestos?: boolean;
  valorImpuestos?: number;
  createdAt?: string;
};

type TipoDocumentoProyectoOption = {
  id: string;
  nombre: string;
  descripcion?: string;
  activo?: boolean;
  createdAt?: string;
};

type UserRole = 'member' | 'admin' | 'super_admin';

type InviteUserInput = {
  email: string;
  nombre?: string;
  role?: UserRole;
  permissions?: PermissionKey[];
};

type ExchangeAuthTokenInput = {
  provider?: AuthProvider;
  idToken: string;
};

type MonedaProyecto = 'CLP' | 'UF' | 'USD';

type HitoPagoProyecto = {
  id: string;
  proyectoId: string;
  codigoProyecto?: string;
  nroHito: number;
  montoHito: number;
  moneda: MonedaProyecto;
  fechaCompromiso: string;
  fechaPago?: string;
  facturado: boolean;
  pagado: boolean;
  observacion?: string;
  createdAt?: string;
};

type DocumentoProyectoRecord = {
  id: string;
  proyectoId: string;
  codigoProyecto?: string;
  tipoDocumentoProyectoId: string;
  tipoDocumentoNombre?: string;
  fechaDocumento?: string;
  nroReferencia?: string;
  observacion?: string;
  createdAt?: string;
  archivoAdjunto?: {
    nombre: string;
    url: string;
    tipo: string;
  };
};

type DocumentoHitoRecord = {
  id: string;
  hitoPagoId: string;
  proyectoId: string;
  codigoProyecto?: string;
  nroHito: number;
  createdAt?: string;
  archivoAdjunto?: {
    nombre: string;
    url: string;
    tipo: string;
  };
};

type BootstrapResponse = {
  tenant: TenantInfo;
  empresas: Empresa[];
  proyectos: Proyecto[];
  categorias: CategoriaOption[];
  tiposDocumento: TipoDocumentoOption[];
  colaboradores: Colaborador[];
};

type ConfiguracionResponse = BootstrapResponse & {
  tiposDocumentoProyecto: TipoDocumentoProyectoOption[];
};

type ProyectoCreateInput = Omit<Proyecto, 'id' | 'createdAt'>;

type HorasProject = {
  id: string;
  nombre: string;
  codigoProyecto?: string;
};

type HoraEntry = {
  id: string;
  proyectoId: string;
  proyectoNombre: string;
  proyectoCodigo?: string;
  userId: string;
  userNombre: string;
  userEmail: string;
  fecha: string;
  horas: number;
  detalle?: string;
  createdAt?: string;
  updatedAt?: string;
};

type HoraEntryInput = {
  proyectoId: string;
  fecha: string;
  horas: number;
  detalle?: string | null;
};

type HorasUser = {
  id: string;
  nombre: string;
  email: string;
};

type HorasResponse = {
  range: { from: string; to: string };
  projects: HorasProject[];
  entries: HoraEntry[];
};

type HorasDashboardResponse = {
  filters: { from: string; to: string; proyectoId: string; userId: string };
  projects: HorasProject[];
  users: HorasUser[];
  entries: HoraEntry[];
  summary: { totalHours: number; people: number; projects: number; records: number };
};
type EmpresaCreateInput = Omit<Empresa, 'id' | 'createdAt'>;
type EmpresaGastosResumen = {
  empresaId: string;
  totalGastos: number;
};
type EmpresaFusionInput = {
  empresaIds: string[];
  empresaPrincipalId: string;
  empresa: EmpresaCreateInput;
};
type EmpresaFusionReasignacion = {
  tabla: string;
  columna: string;
  filas: number;
};
type EmpresaFusionResult = {
  fusionId: string;
  empresa: Empresa;
  empresasAbsorbidas: number;
  gastosReasignados: number;
  reasignaciones: EmpresaFusionReasignacion[];
};
type ColaboradorCreateInput = Omit<Colaborador, 'id' | 'createdAt'>;
type CategoriaCreateInput = Omit<CategoriaOption, 'id'>;
type TipoDocumentoCreateInput = Omit<TipoDocumentoOption, 'id' | 'createdAt'>;
type TipoDocumentoProyectoCreateInput = Omit<TipoDocumentoProyectoOption, 'id' | 'createdAt'>;
type HitoPagoProyectoCreateInput = Omit<HitoPagoProyecto, 'id' | 'codigoProyecto' | 'createdAt'>;
type DocumentoProyectoRecordCreateInput = Omit<DocumentoProyectoRecord, 'id' | 'codigoProyecto' | 'tipoDocumentoNombre' | 'createdAt' | 'archivoAdjunto'> & {
  archivo?: File | null;
};
type DocumentoHitoRecordCreateInput = {
  hitoPagoId: string;
  archivo: File;
};
type GastoAttachmentInput = NonNullable<Gasto['archivosAdjuntos']>[number];
type GastoMutationPayload = Omit<Gasto, 'id' | 'archivosAdjuntos'> & {
  archivosAdjuntos?: GastoAttachmentInput[];
  existingAttachmentIds?: string[];
};
type GastoDocumentExtractionResult = {
  fecha: string | null;
  /** Fecha de vencimiento / fecha de pago detectada en el documento. */
  fechaVencimiento?: string | null;
  /** Dias de credito declarados en el documento (ej: pago a 30 dias). */
  plazoPagoDias?: number | null;
  /** true si el documento desglosa o incluye IVA. */
  tieneIva?: boolean | null;
  tipoDocumento: 'FACTURA' | 'BOLETA' | 'BOLETA DE HONORARIO' | 'FACTURA EXENTA' | 'OTRO';
  numeroDocumento: string | null;
  empresaNombre: string | null;
  empresaRut: string | null;
  emisorNombre: string | null;
  emisorRut: string | null;
  receptorNombre: string | null;
  receptorRut: string | null;
  montoNeto: number | null;
  iva: number | null;
  montoTotal: number | null;
  detalle: string | null;
  confidence: number;
  warnings: string[];
  metadata?: {
    model?: string;
    fileName?: string;
    mimeType?: string;
  };
};
type AsistenciaTipoRegistro = 'entrada' | 'salida';
type AsistenciaRecord = {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  userEmail: string;
  role?: string;
  workDate: string;
  status: 'abierta' | 'cerrada';
  entradaAt: string;
  entradaLatitude: number;
  entradaLongitude: number;
  entradaAccuracyMeters?: number;
  salidaAt?: string;
  salidaLatitude?: number;
  salidaLongitude?: number;
  salidaAccuracyMeters?: number;
  createdAt?: string;
  updatedAt?: string;
};
type AsistenciaUser = Pick<TenantUser, 'id' | 'email' | 'nombre' | 'role' | 'estado'>;
type AsistenciaDashboardResponse = {
  timeZone: string;
  range: {
    days: number;
    startDate: string;
    endDate: string;
  };
  summary: {
    activeNow: number;
    completedToday: number;
    recordsInRange: number;
    uniqueWorkersInRange: number;
  };
  currentUserOpenRecord: AsistenciaRecord | null;
  users: AsistenciaUser[];
  records: AsistenciaRecord[];
};
type AsistenciaRegistroInput = {
  tipo: AsistenciaTipoRegistro;
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
};

type ReportesFilterInput = {
  proyectoId?: string;
  ingresos?: 'con_ingresos' | 'sin_ingresos' | 'todos';
  year?: string;
  month?: string;
};

type ReportesBreakdown = {
  name: string;
  amountClp: number;
  percentage: number | null;
};

type ReportesProject = {
  id: string;
  name: string;
  code: string | null;
  currency: MonedaProyecto | null;
  budgetClp: number | null;
  expensesHistoricalClp: number;
  expensesPeriodClp: number;
  executionPercentage: number | null;
  estimatedMarginClp: number | null;
  estimatedMarginPercentage: number | null;
  paidClp: number;
  invoicedPendingClp: number;
  toInvoiceClp: number | null;
  toCollectClp: number | null;
  nextMilestoneDate: string | null;
  overdueDays: number;
  overdueMilestonesCount: number;
  milestoneCount: number;
  health: 'sobre_presupuesto' | 'atencion' | 'en_rango' | 'sin_presupuesto';
};

type PayableAlertItem = {
  id: string;
  projectId: string | null;
  projectName: string;
  supplierName: string;
  categoryName: string;
  date: string;
  daysUntil: number;
  amountClp: number;
  invoiced: boolean;
};

type ReportesPortafolioResponse = {
  summary: {
    totalProjects: number;
    projectsWithBudget: number;
    portfolioClp: number;
    historicalExpensesClp: number;
    periodExpensesClp: number;
    estimatedMarginClp: number;
    estimatedMarginPercentage: number | null;
    paidClp: number;
    invoicedPendingClp: number;
    toInvoiceClp: number;
    toCollectClp: number;
    payablesClp: number;
    payablesCount: number;
  };
  paidMilestones: {
    totalCount: number;
    totalClp: number;
    items: Array<{
      id: string;
      projectId: string;
      projectName: string;
      projectCode: string | null;
      milestoneNumber: number | null;
      paymentDate: string | null;
      amountClp: number;
      invoiced: boolean;
    }>;
    isTruncated: boolean;
  };
  historicalCategories: ReportesBreakdown[];
  historicalSuppliers: ReportesBreakdown[];
  trend: Array<{
    period: string;
    label: string;
    expensesClp: number;
    paymentsClp: number;
  }>;
  collections: {
    segments: Array<{
      key: string;
      label: string;
      amountClp: number;
    }>;
    excessInvoicedClp: number;
  };
  categories: ReportesBreakdown[];
  suppliers: ReportesBreakdown[];
  projects: ReportesProject[];
  alerts: {
    overBudget: Array<{ id: string; name: string; amountClp: number }>;
    overdueMilestones: Array<{
      id: string;
      projectId: string;
      projectName: string;
      milestoneNumber: number | null;
      date: string;
      amountClp: number;
    }>;
    missingBudget: Array<{ id: string; name: string }>;
    unassignedExpenses: {
      count: number;
      amountClp: number;
      items: Array<{
        id: string;
        date: string | null;
        supplierName: string;
        categoryName: string;
        amountClp: number;
      }>;
    };
    unconvertibleMilestones: Array<{
      id: string;
      projectId: string;
      projectName: string;
      milestoneNumber: number | null;
      date: string | null;
      amount: number;
      currency: string;
    }>;
    payables: {
      count: number;
      amountClp: number;
      dueSoonCount: number;
      dueSoonAmountClp: number;
      items: PayableAlertItem[];
      isTruncated: boolean;
    };
    overduePayables: {
      count: number;
      amountClp: number;
      items: PayableAlertItem[];
      isTruncated: boolean;
    };
  };
  meta: {
    filters: {
      proyectoId: string;
      ingresos: 'con_ingresos' | 'sin_ingresos' | 'todos';
      year: string;
      month: string;
    };
    availableYears: string[];
    availableProjects: Array<{ id: string; name: string; code: string | null }>;
    generatedAt: string;
  };
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details ?? null;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const hasFormDataBody = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      ...(hasFormDataBody ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.error || `Request fallida: ${response.status}`;
    throw new ApiError(message, response.status, errorBody);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function buildGastoFormData(gasto: Omit<Gasto, 'id'>) {
  const formData = new FormData();
  const archivosAdjuntos = gasto.archivosAdjuntos || [];
  const existingAttachmentIds = archivosAdjuntos
    .filter((archivo) => !(archivo.file instanceof File))
    .map((archivo) => archivo.id)
    .filter((id): id is string => Boolean(id));

  const payload: GastoMutationPayload = {
    ...gasto,
    archivosAdjuntos: undefined,
    existingAttachmentIds,
  };

  formData.append('payload', JSON.stringify(payload));

  archivosAdjuntos.forEach((archivo) => {
    if (archivo.file instanceof File) {
      formData.append('archivosAdjuntos', archivo.file);
    }
  });

  return formData;
}

function buildGastoExtractionFormData(file: File) {
  const formData = new FormData();
  formData.append('archivo', file);
  return formData;
}

function buildDocumentoProyectoFormData(documento: DocumentoProyectoRecordCreateInput) {
  const formData = new FormData();
  const payload = {
    ...documento,
    archivo: undefined,
  };

  formData.append('payload', JSON.stringify(payload));

  if (documento.archivo instanceof File) {
    formData.append('archivo', documento.archivo);
  }

  return formData;
}

function buildDocumentoHitoFormData(documento: DocumentoHitoRecordCreateInput) {
  const formData = new FormData();
  formData.append('payload', JSON.stringify({ hitoPagoId: documento.hitoPagoId }));
  formData.append('archivo', documento.archivo);
  return formData;
}

export const postgresApi = {
  getSession() {
    return request<AppSession>('/api/session');
  },

  exchangeAuthToken({ provider = 'microsoft', idToken }: ExchangeAuthTokenInput) {
    return request<AppSession>('/api/auth/exchange', {
      method: 'POST',
      body: JSON.stringify({ provider, idToken }),
    });
  },

  setActiveTenant(tenantId: string) {
    return request<AppSession>('/api/session/tenant', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    });
  },

  logout() {
    return request<void>('/api/auth/logout', {
      method: 'POST',
    });
  },

  getBootstrap() {
    return request<BootstrapResponse>('/api/bootstrap');
  },

  getConfiguracion() {
    return request<ConfiguracionResponse>('/api/configuracion');
  },

  getReportesPortafolio(filters: ReportesFilterInput = {}) {
    const searchParams = new URLSearchParams({
      proyectoId: filters.proyectoId || 'all',
      ingresos: filters.ingresos || 'con_ingresos',
      year: filters.year || String(new Date().getFullYear()),
      month: filters.month || 'all',
    });

    return request<ReportesPortafolioResponse>(`/api/reportes/portafolio?${searchParams.toString()}`);
  },

  getUsuarios() {
    return request<TenantUser[]>('/api/usuarios');
  },

  inviteUsuario(usuario: InviteUserInput) {
    return request<TenantUser>('/api/usuarios', {
      method: 'POST',
      body: JSON.stringify({
        email: usuario.email,
        nombre: usuario.nombre,
        rol: usuario.role,
        permissions: usuario.permissions,
      }),
    });
  },

  updateUsuario(membershipId: string, cambios: { nombre?: string; role?: UserRole; permissions?: PermissionKey[] }) {
    return request<TenantUser>(`/api/usuarios/${membershipId}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: cambios.nombre,
        rol: cambios.role,
        permissions: cambios.permissions,
      }),
    });
  },

  deleteUsuario(membershipId: string) {
    return request<TenantUser>(`/api/usuarios/${membershipId}`, {
      method: 'DELETE',
    });
  },

  getAsistenciaDashboard(days = 30) {
    const searchParams = new URLSearchParams({ days: String(days) });
    return request<AsistenciaDashboardResponse>(`/api/asistencia/dashboard?${searchParams.toString()}`);
  },

  getAsistenciaPersonal(days = 30) {
    const searchParams = new URLSearchParams({ days: String(days) });
    return request<AsistenciaDashboardResponse>(`/api/asistencia/me?${searchParams.toString()}`);
  },

  registrarAsistencia(registro: AsistenciaRegistroInput) {
    return request<AsistenciaRecord>('/api/asistencia/marcar', {
      method: 'POST',
      body: JSON.stringify(registro),
    });
  },

  getGastos() {
    return request<Gasto[]>('/api/gastos');
  },

  getHoras(from: string, to: string) {
    const searchParams = new URLSearchParams({ from, to });
    return request<HorasResponse>(`/api/horas?${searchParams.toString()}`);
  },

  createHora(entry: HoraEntryInput) {
    return request<HoraEntry>('/api/horas', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  },

  updateHora(id: string, entry: HoraEntryInput) {
    return request<HoraEntry>(`/api/horas/${id}`, {
      method: 'PUT',
      body: JSON.stringify(entry),
    });
  },

  deleteHora(id: string) {
    return request<void>(`/api/horas/${id}`, { method: 'DELETE' });
  },

  getHorasDashboard(from: string, to: string, proyectoId = 'all', userId = 'all') {
    const searchParams = new URLSearchParams({ from, to, proyectoId, userId });
    return request<HorasDashboardResponse>(`/api/horas/dashboard?${searchParams.toString()}`);
  },

  createProyecto(proyecto: ProyectoCreateInput) {
    return request<Proyecto>('/api/proyectos', {
      method: 'POST',
      body: JSON.stringify(proyecto),
    });
  },

  updateProyecto(id: string, proyecto: ProyectoCreateInput) {
    return request<Proyecto>(`/api/proyectos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(proyecto),
    });
  },

  deleteProyecto(id: string) {
    return request<void>(`/api/proyectos/${id}`, {
      method: 'DELETE',
    });
  },

  createCategoria(categoria: CategoriaCreateInput) {
    return request<CategoriaOption>('/api/categorias', {
      method: 'POST',
      body: JSON.stringify(categoria),
    });
  },

  updateCategoria(id: string, categoria: CategoriaCreateInput) {
    return request<CategoriaOption>(`/api/categorias/${id}`, {
      method: 'PUT',
      body: JSON.stringify(categoria),
    });
  },

  deleteCategoria(id: string) {
    return request<void>(`/api/categorias/${id}`, {
      method: 'DELETE',
    });
  },

  createEmpresa(empresa: EmpresaCreateInput) {
    return request<Empresa>('/api/empresas', {
      method: 'POST',
      body: JSON.stringify(empresa),
    });
  },

  updateEmpresa(id: string, empresa: EmpresaCreateInput) {
    return request<Empresa>(`/api/empresas/${id}`, {
      method: 'PUT',
      body: JSON.stringify(empresa),
    });
  },

  deleteEmpresa(id: string) {
    return request<void>(`/api/empresas/${id}`, {
      method: 'DELETE',
    });
  },

  getEmpresasResumenGastos() {
    return request<EmpresaGastosResumen[]>('/api/empresas/resumen-gastos');
  },

  fusionarEmpresas(input: EmpresaFusionInput) {
    return request<EmpresaFusionResult>('/api/empresas/fusionar', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  createColaborador(colaborador: ColaboradorCreateInput) {
    return request<Colaborador>('/api/colaboradores', {
      method: 'POST',
      body: JSON.stringify(colaborador),
    });
  },

  updateColaborador(id: string, colaborador: ColaboradorCreateInput) {
    return request<Colaborador>(`/api/colaboradores/${id}`, {
      method: 'PUT',
      body: JSON.stringify(colaborador),
    });
  },

  deleteColaborador(id: string) {
    return request<void>(`/api/colaboradores/${id}`, {
      method: 'DELETE',
    });
  },

  createTipoDocumento(tipoDocumento: TipoDocumentoCreateInput) {
    return request<TipoDocumentoOption>('/api/tipos-documento', {
      method: 'POST',
      body: JSON.stringify(tipoDocumento),
    });
  },

  updateTipoDocumento(id: string, tipoDocumento: TipoDocumentoCreateInput) {
    return request<TipoDocumentoOption>(`/api/tipos-documento/${id}`, {
      method: 'PUT',
      body: JSON.stringify(tipoDocumento),
    });
  },

  deleteTipoDocumento(id: string) {
    return request<void>(`/api/tipos-documento/${id}`, {
      method: 'DELETE',
    });
  },

  createTipoDocumentoProyecto(tipoDocumentoProyecto: TipoDocumentoProyectoCreateInput) {
    return request<TipoDocumentoProyectoOption>('/api/tipos-documento-proyecto', {
      method: 'POST',
      body: JSON.stringify(tipoDocumentoProyecto),
    });
  },

  updateTipoDocumentoProyecto(id: string, tipoDocumentoProyecto: TipoDocumentoProyectoCreateInput) {
    return request<TipoDocumentoProyectoOption>(`/api/tipos-documento-proyecto/${id}`, {
      method: 'PUT',
      body: JSON.stringify(tipoDocumentoProyecto),
    });
  },

  deleteTipoDocumentoProyecto(id: string) {
    return request<void>(`/api/tipos-documento-proyecto/${id}`, {
      method: 'DELETE',
    });
  },

  getHitosPagoProyecto() {
    return request<HitoPagoProyecto[]>('/api/control-pagos/hitos');
  },

  createHitoPagoProyecto(hito: HitoPagoProyectoCreateInput) {
    return request<HitoPagoProyecto>('/api/control-pagos/hitos', {
      method: 'POST',
      body: JSON.stringify(hito),
    });
  },

  updateHitoPagoProyecto(id: string, hito: HitoPagoProyectoCreateInput) {
    return request<HitoPagoProyecto>(`/api/control-pagos/hitos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(hito),
    });
  },

  deleteHitoPagoProyecto(id: string) {
    return request<void>(`/api/control-pagos/hitos/${id}`, {
      method: 'DELETE',
    });
  },

  getDocumentosProyecto() {
    return request<DocumentoProyectoRecord[]>('/api/control-pagos/documentos');
  },

  createDocumentoProyecto(documento: DocumentoProyectoRecordCreateInput) {
    return request<DocumentoProyectoRecord>('/api/control-pagos/documentos', {
      method: 'POST',
      body: buildDocumentoProyectoFormData(documento),
    });
  },

  updateDocumentoProyecto(id: string, documento: DocumentoProyectoRecordCreateInput) {
    return request<DocumentoProyectoRecord>(`/api/control-pagos/documentos/${id}`, {
      method: 'PUT',
      body: buildDocumentoProyectoFormData(documento),
    });
  },

  deleteDocumentoProyecto(id: string) {
    return request<void>(`/api/control-pagos/documentos/${id}`, {
      method: 'DELETE',
    });
  },

  getDocumentosHito() {
    return request<DocumentoHitoRecord[]>('/api/control-pagos/documentos-hito');
  },

  createDocumentoHito(documento: DocumentoHitoRecordCreateInput) {
    return request<DocumentoHitoRecord>('/api/control-pagos/documentos-hito', {
      method: 'POST',
      body: buildDocumentoHitoFormData(documento),
    });
  },

  deleteDocumentoHito(id: string) {
    return request<void>(`/api/control-pagos/documentos-hito/${id}`, {
      method: 'DELETE',
    });
  },

  createGasto(gasto: Omit<Gasto, 'id'>) {
    return request<Gasto>('/api/gastos', {
      method: 'POST',
      body: buildGastoFormData(gasto),
    });
  },

  extractGastoDocument(file: File) {
    return request<GastoDocumentExtractionResult>('/api/gastos/extraer-documento', {
      method: 'POST',
      body: buildGastoExtractionFormData(file),
    });
  },

  updateGasto(id: string, gasto: Omit<Gasto, 'id'>) {
    return request<Gasto>(`/api/gastos/${id}`, {
      method: 'PUT',
      body: buildGastoFormData(gasto),
    });
  },

  deleteGasto(id: string) {
    return request<void>(`/api/gastos/${id}`, {
      method: 'DELETE',
    });
  },

  getGastosPorPagar() {
    return request<Gasto[]>('/api/gastos/por-pagar');
  },

  createGastoPorPagar(gasto: Omit<Gasto, 'id'>) {
    return request<Gasto>('/api/gastos/por-pagar', {
      method: 'POST',
      body: buildGastoFormData(gasto),
    });
  },

  updateGastoPorPagar(id: string, gasto: Omit<Gasto, 'id'>) {
    return request<Gasto>(`/api/gastos/por-pagar/${id}`, {
      method: 'PUT',
      body: buildGastoFormData(gasto),
    });
  },

  marcarGastoPorPagarPagado(id: string, input: { fechaPago?: string; facturado?: boolean } = {}) {
    return request<Gasto>(`/api/gastos/por-pagar/${id}/pagar`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
};

export { ApiError };

export type {
  AppSession,
  BootstrapResponse,
  CategoriaCreateInput,
  CategoriaOption,
  ColaboradorCreateInput,
  ConfiguracionResponse,
  DocumentoHitoRecord,
  DocumentoHitoRecordCreateInput,
  GastoDocumentExtractionResult,
  DocumentoProyectoRecord,
  DocumentoProyectoRecordCreateInput,
  EmpresaCreateInput,
  EmpresaFusionInput,
  EmpresaFusionReasignacion,
  EmpresaFusionResult,
  EmpresaGastosResumen,
  HitoPagoProyecto,
  HitoPagoProyectoCreateInput,
  HoraEntry,
  HoraEntryInput,
  HorasDashboardResponse,
  HorasProject,
  HorasResponse,
  HorasUser,
  MonedaProyecto,
  ProyectoCreateInput,
  SessionUser,
  TenantInfo,
  TenantMembership,
  TenantUser,
  UserRole,
  TipoDocumentoCreateInput,
  TipoDocumentoOption,
  TipoDocumentoProyectoCreateInput,
  TipoDocumentoProyectoOption,
  InviteUserInput,
  AuthProvider,
  ExchangeAuthTokenInput,
  AsistenciaDashboardResponse,
  AsistenciaRecord,
  AsistenciaUser,
  AsistenciaRegistroInput,
  AsistenciaTipoRegistro,
  PayableAlertItem,
  ReportesFilterInput,
  ReportesPortafolioResponse,
  ReportesProject,
};
