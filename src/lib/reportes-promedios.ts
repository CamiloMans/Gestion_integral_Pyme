import type { ReportesPortafolioResponse } from '@/services/postgresApi';

type Averages = ReportesPortafolioResponse['averages'];

export type EstadoMes = Averages['months'][number]['state'];

export type PuntoPromedio = {
  period: string;
  label: string;
  state: EstadoMes;
  gastos: number;
  cobros: number;
  gastosAcumulados: number;
  cobrosAcumulados: number;
  /** Lo que REKOSOL ha puesto de su bolsillo hasta ese mes. */
  aporteAcumulado: number;
};

export type MesParcial = {
  period: string;
  label: string;
  gastos: number;
  cobros: number;
  diasTranscurridos: number;
  diasDelMes: number;
  /** Fraccion del mes ya transcurrida, entre 0 y 1. */
  avance: number;
};

export type ResumenPromedios = {
  /** Los meses que se dibujan: nunca incluye los futuros. */
  puntos: PuntoPromedio[];
  /** Meses cerrados que entran en el promedio. */
  mesesConsiderados: number;
  primerMes: string | null;
  ultimoMes: string | null;
  promedioGastos: number;
  promedioCobros: number;
  /** Positivo quiere decir que se gasta mas rapido de lo que se cobra. */
  diferencia: number;
  /** El mes en curso, aparte del promedio porque todavia no termina. */
  mesParcial: MesParcial | null;
  gastosAcumulados: number;
  cobrosAcumulados: number;
  aporteFinal: number;
  /** Habia movimiento antes del 1 de enero del año mirado. */
  tieneArrastre: boolean;
};

const RESUMEN_VACIO: ResumenPromedios = {
  puntos: [],
  mesesConsiderados: 0,
  primerMes: null,
  ultimoMes: null,
  promedioGastos: 0,
  promedioCobros: 0,
  diferencia: 0,
  mesParcial: null,
  gastosAcumulados: 0,
  cobrosAcumulados: 0,
  aporteFinal: 0,
  tieneArrastre: false,
};

/**
 * Promedios y acumulados mensuales de gastos y cobros.
 *
 * Tres reglas que el grafico mensual no aplica:
 *   - Los meses futuros no se dibujan ni se promedian: dividir por doce en
 *     marzo bajaria el promedio a la mitad sin que haya pasado nada.
 *   - El mes en curso queda fuera del promedio y se informa aparte, porque
 *     esta incompleto por definicion.
 *   - El acumulado arranca del arrastre, no de cero, para que un proyecto que
 *     viene de años anteriores no aparezca partiendo en enero.
 */
export function resumirPromedios(averages: Averages | undefined): ResumenPromedios {
  if (!averages?.months?.length) return RESUMEN_VACIO;

  const visibles = averages.months.filter((mes) => mes.state !== 'futuro');
  if (!visibles.length) return { ...RESUMEN_VACIO, tieneArrastre: false };

  const cerrados = visibles.filter((mes) => mes.state === 'cerrado');
  const tieneArrastre = averages.carryoverExpensesClp > 0 || averages.carryoverPaymentsClp > 0;

  // Sin arrastre, los meses vacios del comienzo del año son meses en los que el
  // proyecto aun no existia: promediarlos bajaria el ritmo real.
  const primerIndiceConMovimiento = cerrados.findIndex((mes) => mes.expensesClp > 0 || mes.paymentsClp > 0);
  const desde = tieneArrastre ? 0 : primerIndiceConMovimiento;
  const considerados = desde < 0 ? [] : cerrados.slice(desde);

  const totalGastos = considerados.reduce((total, mes) => total + mes.expensesClp, 0);
  const totalCobros = considerados.reduce((total, mes) => total + mes.paymentsClp, 0);
  const promedioGastos = considerados.length ? Math.round(totalGastos / considerados.length) : 0;
  const promedioCobros = considerados.length ? Math.round(totalCobros / considerados.length) : 0;

  let gastosAcumulados = averages.carryoverExpensesClp;
  let cobrosAcumulados = averages.carryoverPaymentsClp;

  const puntos: PuntoPromedio[] = visibles.map((mes) => {
    gastosAcumulados += mes.expensesClp;
    cobrosAcumulados += mes.paymentsClp;

    return {
      period: mes.period,
      label: mes.label,
      state: mes.state,
      gastos: mes.expensesClp,
      cobros: mes.paymentsClp,
      gastosAcumulados,
      cobrosAcumulados,
      aporteAcumulado: gastosAcumulados - cobrosAcumulados,
    };
  });

  const parcial = visibles.find((mes) => mes.state === 'parcial');
  const diasDelMes = averages.daysInMonth ?? 0;
  const diasTranscurridos = averages.elapsedDays ?? 0;

  return {
    puntos,
    mesesConsiderados: considerados.length,
    primerMes: considerados[0]?.period ?? null,
    ultimoMes: considerados[considerados.length - 1]?.period ?? null,
    promedioGastos,
    promedioCobros,
    diferencia: promedioGastos - promedioCobros,
    mesParcial: parcial
      ? {
        period: parcial.period,
        label: parcial.label,
        gastos: parcial.expensesClp,
        cobros: parcial.paymentsClp,
        diasTranscurridos,
        diasDelMes,
        avance: diasDelMes > 0 ? diasTranscurridos / diasDelMes : 0,
      }
      : null,
    gastosAcumulados,
    cobrosAcumulados,
    aporteFinal: gastosAcumulados - cobrosAcumulados,
    tieneArrastre,
  };
}

/** Texto que explica sobre que meses se calculo el promedio. */
export function describirPeriodo(resumen: ResumenPromedios): string {
  if (!resumen.mesesConsiderados) return 'Todavia no hay meses cerrados para promediar.';

  const meses = resumen.mesesConsiderados === 1 ? '1 mes cerrado' : `${resumen.mesesConsiderados} meses cerrados`;
  const parcial = resumen.mesParcial
    ? ` ${resumen.mesParcial.label} va en ${resumen.mesParcial.diasTranscurridos} de ${resumen.mesParcial.diasDelMes} dias y queda fuera del promedio.`
    : '';

  return `Promedio sobre ${meses}.${parcial}`;
}
