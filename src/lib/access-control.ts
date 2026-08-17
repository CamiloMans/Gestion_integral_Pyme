import {
  ACCESS_GROUPS as sharedAccessGroups,
  ALL_PERMISSIONS as sharedAllPermissions,
  DEFAULT_ROUTE_PRIORITY,
  LEGACY_MEMBER_PERMISSIONS,
  PERMISSIONS as sharedPermissions,
  getDefaultRoute as sharedGetDefaultRoute,
  getEffectivePermissions as sharedGetEffectivePermissions,
  hasAnyPermission as sharedHasAnyPermission,
  hasPermission as sharedHasPermission,
  normalizePermissionKeys as sharedNormalizePermissionKeys,
} from '../../shared/access-control.js';

export const PERMISSIONS = sharedPermissions;
export const ALL_PERMISSIONS = sharedAllPermissions;
export const ACCESS_GROUPS = sharedAccessGroups;
export { DEFAULT_ROUTE_PRIORITY, LEGACY_MEMBER_PERMISSIONS };

export type PermissionKey = (typeof ALL_PERMISSIONS)[number];

export type PermissionSession = {
  role?: string | null;
  permissions?: string[] | null;
} | null | undefined;

export const normalizePermissionKeys = (values: unknown): PermissionKey[] =>
  sharedNormalizePermissionKeys(values) as PermissionKey[];

export const getEffectivePermissions = (role: string | null | undefined, values: unknown): PermissionKey[] =>
  sharedGetEffectivePermissions(role, values) as PermissionKey[];

export const hasPermission = (session: PermissionSession, permission: PermissionKey) =>
  sharedHasPermission(session, permission);

export const hasAnyPermission = (session: PermissionSession, permissions: PermissionKey[]) =>
  sharedHasAnyPermission(session, permissions);

export const getDefaultRoute = (session: PermissionSession) => sharedGetDefaultRoute(session);
