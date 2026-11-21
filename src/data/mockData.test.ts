import { describe, expect, it } from 'vitest';
import { formatDate, formatDateLong } from './mockData';

// vitest.config.ts fija TZ=America/Santiago (UTC-3/-4), donde `new Date('2026-10-29')`
// —medianoche UTC— retrocede al 28 si se formatea en hora local.
describe('formatDate', () => {
  it('respeta el dia de una fecha calendario', () => {
    expect(formatDate('2026-10-29')).toBe('29-10-2026');
  });

  it('no corre el dia en el primero de mes', () => {
    expect(formatDate('2026-11-01')).toBe('01-11-2026');
  });

  it('convierte un timestamp a la zona local', () => {
    // 2026-10-29T01:00:00Z son las 22:00 del 28 en Santiago.
    expect(formatDate('2026-10-29T01:00:00.000Z')).toBe('28-10-2026');
    expect(formatDate('2026-10-29T15:00:00.000Z')).toBe('29-10-2026');
  });

  it.each(['', 'no-es-fecha'])('devuelve guion para %p', (value) => {
    expect(formatDate(value)).toBe('-');
  });
});

describe('formatDateLong', () => {
  it('respeta el dia de una fecha calendario', () => {
    expect(formatDateLong('2026-10-29')).toBe('29 de octubre de 2026');
  });

  it('convierte un timestamp a la zona local', () => {
    expect(formatDateLong('2026-10-29T01:00:00.000Z')).toBe('28 de octubre de 2026');
  });
});
