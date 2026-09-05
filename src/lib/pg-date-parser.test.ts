import { describe, expect, it } from 'vitest';
import pg from 'pg';
import '../../server/db.js'; // efecto de import: registra el parser de DATE

describe('parser de columnas date (OID 1082)', () => {
  it('devuelve el texto crudo YYYY-MM-DD, no un Date', () => {
    const parsed = pg.types.getTypeParser(pg.types.builtins.DATE)('2026-09-04');

    expect(typeof parsed).toBe('string');
    expect(parsed).toBe('2026-09-04');
  });

  it('sobrevive a JSON.stringify sin corrimiento de dia', () => {
    const parse = pg.types.getTypeParser(pg.types.builtins.DATE);
    const payload = JSON.parse(JSON.stringify({ fecha: parse('2026-09-04') }));

    expect(payload.fecha).toBe('2026-09-04');
  });

  it('no toca timestamptz: los instantes siguen siendo Date', () => {
    const parsed = pg.types.getTypeParser(pg.types.builtins.TIMESTAMPTZ)('2026-09-04 12:00:00+00');

    expect(parsed).toBeInstanceOf(Date);
    expect((parsed as Date).toISOString()).toBe('2026-09-04T12:00:00.000Z');
  });
});
