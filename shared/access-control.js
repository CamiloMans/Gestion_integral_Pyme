export const PERMISSIONS = Object.freeze({
  REPORTS_DASHBOARD: 'reports.dashboard',
  EXPENSES_RECORDS: 'expenses.records',
  EXPENSES_BULK_UPLOAD: 'expenses.bulk_upload',
  SETTINGS_COMPANIES: 'settings.companies',
  SETTINGS_PROJECTS: 'settings.projects',
  SETTINGS_COLLABORATORS: 'settings.collaborators',
  SETTINGS_USERS: 'settings.users',
  SETTINGS_EXPENSE_CATEGORIES: 'settings.expense_categories',
  SETTINGS_EXPENSE_DOCUMENT_TYPES: 'settings.expense_document_types',
  SETTINGS_PROJECT_DOCUMENT_TYPES: 'settings.project_document_types',
  PROJECT_CONTROL_PROJECTS: 'project_control.projects',
  PROJECT_CONTROL_DOCUMENTS: 'project_control.documents',
  PROJECT_CONTROL_MILESTONES: 'project_control.milestones',
  HOURS_PERSONAL: 'hours.personal',
  HOURS_DASHBOARD: 'hours.dashboard',
  ATTENDANCE_PERSONAL: 'attendance.personal',
  ATTENDANCE_TEAM: 'attendance.team',
});

export const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

export const ACCESS_GROUPS = Object.freeze([
  {
    id: 'dashboard',
    label: 'Dashboard',
    children: [{ key: PERMISSIONS.REPORTS_DASHBOARD, label: 'Dashboard general', path: '/reportes' }],
  },
  {
    id: 'expenses',
    label: 'Gestión de Gastos',
    children: [
      { key: PERMISSIONS.EXPENSES_RECORDS, label: 'Gastos', path: '/gastos' },
      { key: PERMISSIONS.EXPENSES_BULK_UPLOAD, label: 'Carga masiva', path: '/gastos/carga-masiva' },
    ],
  },
  {
    id: 'settings',
    label: 'Configuración',
    children: [
      { key: PERMISSIONS.SETTINGS_COMPANIES, label: 'Empresas', path: '/empresas' },
      { key: PERMISSIONS.SETTINGS_PROJECTS, label: 'Proyectos', path: '/empresas' },
      { key: PERMISSIONS.SETTINGS_COLLABORATORS, label: 'Colaboradores', path: '/empresas' },
      { key: PERMISSIONS.SETTINGS_USERS, label: 'Usuarios', path: '/empresas' },
      { key: PERMISSIONS.SETTINGS_EXPENSE_CATEGORIES, label: 'Categorías', path: '/empresas' },
      { key: PERMISSIONS.SETTINGS_EXPENSE_DOCUMENT_TYPES, label: 'Tipos de Documento', path: '/empresas' },
      { key: PERMISSIONS.SETTINGS_PROJECT_DOCUMENT_TYPES, label: 'Docs. de Proyecto', path: '/empresas' },
    ],
  },
  {
    id: 'project_control',
    label: 'Control de Proyectos',
    children: [
      { key: PERMISSIONS.PROJECT_CONTROL_PROJECTS, label: 'Proyectos', path: '/control-pagos/proyectos' },
      { key: PERMISSIONS.PROJECT_CONTROL_DOCUMENTS, label: 'Documentos', path: '/control-pagos/documentos' },
      { key: PERMISSIONS.PROJECT_CONTROL_MILESTONES, label: 'Hitos', path: '/control-pagos/hitos' },
    ],
  },
  {
    id: 'hours',
    label: 'Control de Horas',
    children: [
      { key: PERMISSIONS.HOURS_PERSONAL, label: 'Carga personal', path: '/horas/carga' },
      { key: PERMISSIONS.HOURS_DASHBOARD, label: 'Dashboard global', path: '/horas/dashboard' },
    ],
  },
  {
    id: 'attendance',
    label: 'Control de Asistencia',
    children: [
      { key: PERMISSIONS.ATTENDANCE_PERSONAL, label: 'Registro individual', path: '/asistencia/registro' },
      { key: PERMISSIONS.ATTENDANCE_TEAM, label: 'Personal', path: '/asistencia/personal' },
    ],
  },
]);

export const LEGACY_MEMBER_PERMISSIONS = Object.freeze(
  ALL_PERMISSIONS.filter((permission) => ![
    PERMISSIONS.REPORTS_DASHBOARD,
    PERMISSIONS.HOURS_DASHBOARD,
    PERMISSIONS.ATTENDANCE_TEAM,
  ].includes(permission)),
);

export const DEFAULT_ROUTE_PRIORITY = Object.freeze([
  PERMISSIONS.REPORTS_DASHBOARD,
  PERMISSIONS.EXPENSES_RECORDS,
  PERMISSIONS.EXPENSES_BULK_UPLOAD,
  PERMISSIONS.PROJECT_CONTROL_PROJECTS,
  PERMISSIONS.PROJECT_CONTROL_DOCUMENTS,
  PERMISSIONS.PROJECT_CONTROL_MILESTONES,
  PERMISSIONS.HOURS_PERSONAL,
  PERMISSIONS.HOURS_DASHBOARD,
  PERMISSIONS.ATTENDANCE_PERSONAL,
  PERMISSIONS.ATTENDANCE_TEAM,
  ...ACCESS_GROUPS.find((group) => group.id === 'settings').children.map((item) => item.key),
]);

const PERMISSION_PATHS = new Map(
  ACCESS_GROUPS.flatMap((group) => group.children.map((item) => [item.key, item.path])),
);

export function normalizePermissionKeys(values) {
  const allowed = new Set(ALL_PERMISSIONS);
  return [...new Set(Array.isArray(values) ? values : [])]
    .filter((permission) => allowed.has(permission))
    .sort((left, right) => ALL_PERMISSIONS.indexOf(left) - ALL_PERMISSIONS.indexOf(right));
}

export function getEffectivePermissions(role, values) {
  return String(role || '').trim().toLowerCase() === 'super_admin'
    ? [...ALL_PERMISSIONS]
    : normalizePermissionKeys(values);
}

export function hasPermission(session, permission) {
  return getEffectivePermissions(session?.role, session?.permissions).includes(permission);
}

export function hasAnyPermission(session, permissions) {
  const effective = new Set(getEffectivePermissions(session?.role, session?.permissions));
  return permissions.some((permission) => effective.has(permission));
}

export function getDefaultRoute(session) {
  const effective = new Set(getEffectivePermissions(session?.role, session?.permissions));
  const permission = DEFAULT_ROUTE_PRIORITY.find((candidate) => effective.has(candidate));
  return permission ? PERMISSION_PATHS.get(permission) : '/sin-acceso';
}
