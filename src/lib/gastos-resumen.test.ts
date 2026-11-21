import { describe, expect, it } from 'vitest';
import { esPendiente, montoDeGasto, resumirGastos } from './gastos-resumen';
import type { Gasto } from '@/data/mockData';

const gasto = (parcial: Partial<Gasto>): Gasto => ({
  id: 'gasto',
  fecha: '2026-10-28',
  empresaId: 'empresa-1',
  categoria: 'categoria-1',
  tipoDocumento: 'tipo-1',
  numeroDocumento: 'F-1',
  monto: 1000,
  montoTotal: 1000,
  origen: 'INMEDIATO',
  ...parcial,
}) as Gasto;

describe('montoDeGasto', () => {
  it('prefiere el monto total', () => {
    expect(montoDeGasto(gasto({ monto: 500, montoTotal: 1190 }))).toBe(1190);
  });

  it('cae al monto simple cuando no hay total', () => {
    expect(montoDeGasto(gasto({ monto: 500, montoTotal: undefined }))).toBe(500);
  });

  it('devuelve 0 si el monto no es un numero', () => {
    expect(montoDeGasto(gasto({ monto: undefined, montoTotal: undefined }))).toBe(0);
  });
});

describe('esPendiente', () => {
  it('un inmediato nunca esta pendiente', () => {
    expect(esPendiente(gasto({ origen: 'INMEDIATO', pagado: false }))).toBe(false);
  });

  it('un compromiso sin pagar esta pendiente', () => {
    expect(esPendiente(gasto({ origen: 'COMPROMISO', pagado: false }))).toBe(true);
  });

  it('un compromiso pagado no esta pendiente', () => {
    expect(esPendiente(gasto({ origen: 'COMPROMISO', pagado: true }))).toBe(false);
  });
});

describe('resumirGastos', () => {
  it('suma todo el conjunto recibido', () => {
    const resumen = resumirGastos([
      gasto({ id: '1', montoTotal: 1000 }),
      gasto({ id: '2', montoTotal: 2500 }),
      gasto({ id: '3', montoTotal: 500, origen: 'COMPROMISO', pagado: false }),
      gasto({ id: '4', montoTotal: 700, origen: 'COMPROMISO', pagado: true }),
    ]);

    expect(resumen.movimientos).toBe(4);
    expect(resumen.total).toBe(4700);
    expect(resumen.pagado).toBe(4200);
    expect(resumen.pendiente).toBe(500);
    expect(resumen.movimientosPendientes).toBe(1);
  });

  it('pagado mas pendiente siempre da el total', () => {
    const resumen = resumirGastos([
      gasto({ id: '1', montoTotal: 333 }),
      gasto({ id: '2', montoTotal: 667, origen: 'COMPROMISO', pagado: false }),
    ]);

    expect(resumen.pagado + resumen.pendiente).toBe(resumen.total);
  });

  it('devuelve ceros con una lista vacia', () => {
    expect(resumirGastos([])).toEqual({
      movimientos: 0,
      total: 0,
      pagado: 0,
      pendiente: 0,
      movimientosPendientes: 0,
    });
  });
});
