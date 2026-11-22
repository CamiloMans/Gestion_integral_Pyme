import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GastosVersusPagos } from './GastosVersusPagos';
import type { ReportesPortafolioResponse } from '@/services/postgresApi';

const ETIQUETAS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const meses = (
  valores: Record<number, { gastos?: number; cobros?: number }>,
  { cerradosHasta, parcial }: { cerradosHasta: number; parcial: number | null },
) =>
  ETIQUETAS.map((label, indice) => {
    const numero = indice + 1;
    let state: 'cerrado' | 'parcial' | 'futuro' = 'futuro';
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

const datos = (parcial: Partial<ReportesPortafolioResponse> = {}): ReportesPortafolioResponse => ({
  trend: [
    { period: '2026-11-01', label: '1', expensesClp: 500, paymentsClp: 0 },
    { period: '2026-11-02', label: '2', expensesClp: 700, paymentsClp: 1000 },
  ],
  averages: {
    months: meses(
      { 1: { gastos: 1_000_000, cobros: 600_000 }, 2: { gastos: 5_000_000, cobros: 1_400_000 } },
      { cerradosHasta: 2, parcial: 3 },
    ),
    carryoverExpensesClp: 0,
    carryoverPaymentsClp: 0,
    currentPeriod: '2026-03',
    elapsedDays: 10,
    daysInMonth: 31,
  },
  meta: {
    filters: { proyectoId: 'all', ingresos: 'con_ingresos', year: '2026', month: 'all' },
    availableYears: ['2026'],
    availableProjects: [],
    generatedAt: '2026-03-10T12:00:00.000Z',
  },
  ...parcial,
}) as ReportesPortafolioResponse;

const serie = (etiqueta: string) => screen.getByRole('button', { name: etiqueta });

describe('GastosVersusPagos', () => {
  it('muestra los dos promedios y su diferencia', () => {
    render(<GastosVersusPagos data={datos()} />);

    expect(screen.getByText('Promedio mensual de gastos')).toBeInTheDocument();
    expect(screen.getByText('$3.000.000')).toBeInTheDocument();
    expect(screen.getByText('$1.000.000')).toBeInTheDocument();
    expect(screen.getByText('$2.000.000')).toBeInTheDocument();
    expect(screen.getByText('Se gasta mas rapido de lo que se cobra.')).toBeInTheDocument();
  });

  it('ofrece las siete series en un solo selector', () => {
    render(<GastosVersusPagos data={datos()} />);

    for (const etiqueta of [
      'Gastos del mes',
      'Cobros del mes',
      'Promedio de gastos',
      'Promedio de cobros',
      'Gastos acumulados',
      'Cobros acumulados',
      'Aporte de REKOSOL',
    ]) {
      expect(serie(etiqueta)).toBeInTheDocument();
    }
  });

  it('arranca con el mes a mes y sus promedios encendidos', () => {
    render(<GastosVersusPagos data={datos()} />);

    expect(serie('Gastos del mes')).toHaveAttribute('data-state', 'on');
    expect(serie('Promedio de cobros')).toHaveAttribute('data-state', 'on');
    expect(serie('Gastos acumulados')).toHaveAttribute('data-state', 'off');
  });

  it('enciende y apaga una serie al pulsarla', () => {
    render(<GastosVersusPagos data={datos()} />);

    fireEvent.click(serie('Gastos del mes'));
    expect(serie('Gastos del mes')).toHaveAttribute('data-state', 'off');

    fireEvent.click(serie('Gastos del mes'));
    expect(serie('Gastos del mes')).toHaveAttribute('data-state', 'on');
  });

  it('explica el eje de la derecha solo cuando hay un acumulado encendido', () => {
    render(<GastosVersusPagos data={datos()} />);

    expect(screen.queryByText(/eje de la derecha/)).not.toBeInTheDocument();

    fireEvent.click(serie('Aporte de REKOSOL'));

    expect(screen.getByText(/eje de la derecha/)).toBeInTheDocument();
    expect(screen.getByText(/REKOSOL ha puesto/)).toBeInTheDocument();
  });

  it('pide encender una serie cuando se apagan todas', () => {
    render(<GastosVersusPagos data={datos()} />);

    for (const etiqueta of ['Gastos del mes', 'Cobros del mes', 'Promedio de gastos', 'Promedio de cobros']) {
      fireEvent.click(serie(etiqueta));
    }

    expect(screen.getByText('Enciende al menos una serie para ver el grafico.')).toBeInTheDocument();
  });

  it('dice sobre que meses se calculo el promedio', () => {
    render(<GastosVersusPagos data={datos()} />);

    expect(screen.getByText(/2 meses cerrados/)).toBeInTheDocument();
    expect(screen.getByText(/mar va en 10 de 31 dias/)).toBeInTheDocument();
  });

  it('avisa que las series son caja efectiva', () => {
    render(<GastosVersusPagos data={datos()} />);

    expect(screen.getByText(/Los compromisos sin pagar no entran/)).toBeInTheDocument();
  });

  it('con un mes elegido muestra los dias y no ofrece series', () => {
    const data = datos();
    render(<GastosVersusPagos data={{
      ...data,
      meta: { ...data.meta, filters: { ...data.meta.filters, month: '11' } },
    }} />);

    expect(screen.getByText(/el grafico muestra sus dias/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gastos acumulados' })).not.toBeInTheDocument();
  });

  it('avisa cuando el año no tiene meses con datos', () => {
    const data = datos();
    render(<GastosVersusPagos data={{
      ...data,
      averages: { ...data.averages, months: [] },
    }} />);

    expect(screen.getByText('El año elegido todavia no tiene meses con datos.')).toBeInTheDocument();
  });
});
