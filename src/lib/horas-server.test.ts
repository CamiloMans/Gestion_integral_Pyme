import { describe, expect, it } from 'vitest';
import {
  assertCanManageProjectHours,
  assertDailyHoursLimit,
  assertHoraDateIsNotFuture,
  registroHorasSchema,
} from '../../server/horas.js';

const validInput = {
  proyectoId: '11111111-1111-4111-8111-111111111111',
  fecha: '2026-08-16',
  horas: 1,
  detalle: null,
};

describe('reglas del servidor para cargas de horas', () => {
  it.each([0.25, 0.5, 1, 2.75, 24])('acepta %s horas', (hours) => {
    expect(registroHorasSchema.safeParse({ ...validInput, horas: hours }).success).toBe(true);
  });

  it.each([0, -1, 0.1, 1.2, 24.25])('rechaza %s horas', (hours) => {
    expect(registroHorasSchema.safeParse({ ...validInput, horas: hours }).success).toBe(false);
  });

  it('rechaza fechas futuras y acepta hoy o fechas pasadas', () => {
    expect(() => assertHoraDateIsNotFuture('2026-08-17', '2026-08-16')).toThrow('fecha futura');
    expect(() => assertHoraDateIsNotFuture('2026-08-16', '2026-08-16')).not.toThrow();
    expect(() => assertHoraDateIsNotFuture('2020-01-01', '2026-08-16')).not.toThrow();
  });

  it('reserva la habilitación de proyectos al superadministrador', () => {
    expect(() => assertCanManageProjectHours('member', { permiteCargaHoras: true })).toThrow('super administrador');
    expect(() => assertCanManageProjectHours('admin', { permiteCargaHoras: false })).toThrow('super administrador');
    expect(() => assertCanManageProjectHours('super_admin', { permiteCargaHoras: true })).not.toThrow();
    expect(() => assertCanManageProjectHours('member', { nombre: 'Proyecto' })).not.toThrow();
  });

  it('aplica el máximo diario entre todos los proyectos', () => {
    expect(() => assertDailyHoursLimit(20, 4)).not.toThrow();
    expect(() => assertDailyHoursLimit(20, 4.25)).toThrow('máximo diario de 24 horas');
  });
});
