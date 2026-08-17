import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  getDefaultRoute,
  getEffectivePermissions,
  hasPermission,
  normalizePermissionKeys,
  PERMISSIONS,
} from './access-control';
import { assertPermission, validatePermissionKeys } from '../../server/access-control.js';

describe('control de acceso por membresía', () => {
  it('mantiene permisos distintos para usuarios con el mismo rol', () => {
    const expensesMember = { role: 'member', permissions: [PERMISSIONS.EXPENSES_RECORDS] };
    const hoursMember = { role: 'member', permissions: [PERMISSIONS.HOURS_DASHBOARD] };

    expect(hasPermission(expensesMember, PERMISSIONS.EXPENSES_RECORDS)).toBe(true);
    expect(hasPermission(expensesMember, PERMISSIONS.HOURS_DASHBOARD)).toBe(false);
    expect(hasPermission(hoursMember, PERMISSIONS.HOURS_DASHBOARD)).toBe(true);
    expect(getDefaultRoute(hoursMember)).toBe('/horas/dashboard');
  });

  it('otorga acceso efectivo total al Super Admin', () => {
    expect(getEffectivePermissions('super_admin', [])).toEqual(ALL_PERMISSIONS);
    expect(getDefaultRoute({ role: 'super_admin', permissions: [] })).toBe('/reportes');
  });

  it('normaliza duplicados y rechaza claves desconocidas en escrituras', () => {
    expect(normalizePermissionKeys([
      PERMISSIONS.HOURS_PERSONAL,
      PERMISSIONS.HOURS_PERSONAL,
      'unknown.permission',
    ])).toEqual([PERMISSIONS.HOURS_PERSONAL]);
    expect(() => validatePermissionKeys(['unknown.permission'])).toThrow('permisos desconocidos');
  });

  it('devuelve un 403 identificable cuando falta el permiso de API', () => {
    const req = { auth: { role: 'member', permissions: [PERMISSIONS.HOURS_PERSONAL] } };
    try {
      assertPermission(req, PERMISSIONS.HOURS_DASHBOARD);
      throw new Error('Se esperaba un rechazo');
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' });
    }
  });
});
