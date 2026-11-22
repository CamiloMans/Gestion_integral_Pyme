import { describe, expect, it } from 'vitest';
import { describirPeriodo, resumirPromedios } from './reportes-promedios';
import type { ReportesPortafolioResponse } from '@/services/postgresApi';

type Averages = ReportesPortafolioResponse['averages'];
type Mes = Averages['months'][number];

const ETIQUETAS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Doce meses de 2026. `hasta` es el ultimo mes cerrado y `parcial` el mes en
 * curso; lo que viene despues queda como futuro, igual que lo arma el servidor.
 */
const meses = (
  valores: Record<number, { gastos?: number; cobros?: number }>,
  { cerradosHasta, parcial }: { cerradosHasta: number; parcial: number | null },
): Mes[] =>
  ETIQUETAS.map((label, indice) => {
    const numero = indice + 1;
    let state: Mes['state'] = 'futuro';
    if (numero <= cerradosHasta) state = 'cerrado';
    else if (numero === parcial) state = 'parcial';

    return {
      period: `2026-${String(numero).padStart(2, '0')}`,
      label,
      state,
      expensesClp: valores[numero]?.gastos ?? 0,
      paymentsClp: valores[numero]?.cobros ?? 0,
    };
  });

const averages = (parcial: Partial<Averages> = {}): Averages => ({
  months: meses({ 1: { gastos: 1000, cobros: 600 }, 2: { gastos: 3000, cobros: 1400 } }, {
    cerradosHasta: 2,
    parcial: 3,
  }),
  carryoverExpensesClp: 0,
  carryoverPaymentsClp: 0,
  currentPeriod: '2026-03',
  elapsedDays: 10,
  daysInMonth: 31,
  ...parcial,
});

describe('resumirPromedios', () => {
  it('devuelve el resumen vacio sin datos', () => {
    expect(resumirPromedios(undefined).puntos).toEqual([]);
    expect(resumirPromedios({ ...averages(), months: [] }).mesesConsiderados).toBe(0);
  });

  it('no dibuja los meses futuros', () => {
    const resumen = resumirPromedios(averages());

    expect(resumen.puntos).toHaveLength(3);
    expect(resumen.puntos.map((punto) => punto.label)).toEqual(['ene', 'feb', 'mar']);
  });

  it('promedia solo los meses cerrados y deja el mes en curso aparte', () => {
    const resumen = resumirPromedios(averages({
      months: meses(
        { 1: { gastos: 1000, cobros: 600 }, 2: { gastos: 3000, cobros: 1400 }, 3: { gastos: 50, cobros: 0 } },
        { cerradosHasta: 2, parcial: 3 },
      ),
    }));

    expect(resumen.mesesConsiderados).toBe(2);
    expect(resumen.promedioGastos).toBe(2000);
    expect(resumen.promedioCobros).toBe(1000);
    expect(resumen.mesParcial).toMatchObject({ label: 'mar', gastos: 50, diasTranscurridos: 10, diasDelMes: 31 });
  });

  it('la diferencia dice cuanto mas rapido se gasta que se cobra', () => {
    const resumen = resumirPromedios(averages());
    expect(resumen.diferencia).toBe(resumen.promedioGastos - resumen.promedioCobros);
    expect(resumen.diferencia).toBe(1000);
  });

  it('la diferencia es negativa cuando se cobra mas rapido', () => {
    const resumen = resumirPromedios(averages({
      months: meses({ 1: { gastos: 500, cobros: 4000 } }, { cerradosHasta: 1, parcial: 2 }),
    }));

    expect(resumen.diferencia).toBe(-3500);
  });

  it('no promedia los meses anteriores al primer movimiento', () => {
    const resumen = resumirPromedios(averages({
      months: meses({ 5: { gastos: 2000, cobros: 500 }, 6: { gastos: 4000, cobros: 1500 } }, {
        cerradosHasta: 6,
        parcial: 7,
      }),
    }));

    expect(resumen.mesesConsiderados).toBe(2);
    expect(resumen.primerMes).toBe('2026-05');
    expect(resumen.promedioGastos).toBe(3000);
  });

  it('con arrastre promedia desde enero aunque el mes este vacio', () => {
    const resumen = resumirPromedios(averages({
      months: meses({ 2: { gastos: 4000, cobros: 2000 } }, { cerradosHasta: 2, parcial: 3 }),
      carryoverExpensesClp: 900_000,
      carryoverPaymentsClp: 100_000,
    }));

    expect(resumen.tieneArrastre).toBe(true);
    expect(resumen.mesesConsiderados).toBe(2);
    expect(resumen.primerMes).toBe('2026-01');
    expect(resumen.promedioGastos).toBe(2000);
  });

  it('acumula desde el arrastre, no desde cero', () => {
    const resumen = resumirPromedios(averages({
      months: meses({ 1: { gastos: 1000, cobros: 600 }, 2: { gastos: 3000, cobros: 1400 } }, {
        cerradosHasta: 2,
        parcial: 3,
      }),
      carryoverExpensesClp: 10_000,
      carryoverPaymentsClp: 4_000,
    }));

    expect(resumen.puntos[0]).toMatchObject({ gastosAcumulados: 11_000, cobrosAcumulados: 4_600 });
    expect(resumen.puntos[1]).toMatchObject({ gastosAcumulados: 14_000, cobrosAcumulados: 6_000 });
    expect(resumen.gastosAcumulados).toBe(14_000);
    expect(resumen.cobrosAcumulados).toBe(6_000);
  });

  it('el aporte de REKOSOL es la brecha entre lo gastado y lo cobrado', () => {
    const resumen = resumirPromedios(averages());

    expect(resumen.puntos[0].aporteAcumulado).toBe(400);
    expect(resumen.puntos[1].aporteAcumulado).toBe(2000);
    expect(resumen.aporteFinal).toBe(resumen.gastosAcumulados - resumen.cobrosAcumulados);
  });

  it('un año ya terminado no tiene mes parcial', () => {
    const resumen = resumirPromedios(averages({
      months: meses({ 1: { gastos: 1200, cobros: 1200 } }, { cerradosHasta: 12, parcial: null }),
      currentPeriod: null,
      elapsedDays: null,
      daysInMonth: null,
    }));

    expect(resumen.mesParcial).toBeNull();
    expect(resumen.puntos).toHaveLength(12);
    expect(resumen.mesesConsiderados).toBe(12);
  });

  it('sin meses cerrados no inventa un promedio', () => {
    const resumen = resumirPromedios(averages({
      months: meses({ 1: { gastos: 500 } }, { cerradosHasta: 0, parcial: 1 }),
    }));

    expect(resumen.mesesConsiderados).toBe(0);
    expect(resumen.promedioGastos).toBe(0);
    expect(resumen.promedioCobros).toBe(0);
    expect(resumen.puntos).toHaveLength(1);
  });
});

describe('describirPeriodo', () => {
  it('cuenta los meses y avisa del mes parcial', () => {
    const texto = describirPeriodo(resumirPromedios(averages()));

    expect(texto).toContain('2 meses cerrados');
    expect(texto).toContain('mar va en 10 de 31 dias');
  });

  it('usa el singular con un solo mes', () => {
    const texto = describirPeriodo(resumirPromedios(averages({
      months: meses({ 1: { gastos: 100 } }, { cerradosHasta: 1, parcial: 2 }),
    })));

    expect(texto).toContain('1 mes cerrado');
  });

  it('avisa cuando no hay nada que promediar', () => {
    const texto = describirPeriodo(resumirPromedios(averages({
      months: meses({}, { cerradosHasta: 0, parcial: 1 }),
    })));

    expect(texto).toBe('Todavia no hay meses cerrados para promediar.');
  });
});
