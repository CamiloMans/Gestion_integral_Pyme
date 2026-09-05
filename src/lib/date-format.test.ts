import { describe, expect, it } from 'vitest';
import { formatDateOnly, parseDateOnly, toDateOnly, todayDateOnly } from './date-format';

describe('toDateOnly', () => {
  it('deja pasar una fecha calendario', () => {
    expect(toDateOnly('2026-09-04')).toBe('2026-09-04');
  });

  it('recorta un timestamp sin correr el dia', () => {
    expect(toDateOnly('2026-09-04T00:00:00.000Z')).toBe('2026-09-04');
    expect(toDateOnly('2026-09-04T23:59:59.999Z')).toBe('2026-09-04');
  });

  it.each([undefined, null, '', '   ', 'no-es-fecha'])('devuelve vacio para %p', (value) => {
    expect(toDateOnly(value as string | null | undefined)).toBe('');
  });
});

describe('parseDateOnly', () => {
  it('interpreta el dia calendario en hora local, sin importar la zona', () => {
    const parsed = parseDateOnly('2026-09-04T00:00:00.000Z');

    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(8);
    expect(parsed?.getDate()).toBe(4);
  });

  it('es estable sobre el cambio de horario de Chile (2026-09-06)', () => {
    expect(parseDateOnly('2026-09-06')?.getDate()).toBe(6);
    expect(parseDateOnly('2026-09-06T00:00:00.000Z')?.getDate()).toBe(6);
  });

  it('devuelve null para entradas invalidas', () => {
    expect(parseDateOnly('abc')).toBeNull();
    expect(parseDateOnly(null)).toBeNull();
  });
});

describe('todayDateOnly', () => {
  it('devuelve el dia local del navegador en formato YYYY-MM-DD', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    expect(todayDateOnly()).toBe(expected);
    expect(todayDateOnly()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('formatDateOnly (sin cambios)', () => {
  it('sigue formateando a dd/mm/yyyy', () => {
    expect(formatDateOnly('2026-09-04')).toBe('04/09/2026');
    expect(formatDateOnly('2026-09-04T00:00:00.000Z')).toBe('04/09/2026');
    expect(formatDateOnly(null)).toBe('-');
  });
});
