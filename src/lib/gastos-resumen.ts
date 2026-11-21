import type { Gasto } from '@/data/mockData';

export type ResumenGastos = {
  /** Cantidad de movimientos del conjunto filtrado completo, no de la pagina. */
  movimientos: number;
  /** Suma de todos los movimientos: pagado mas pendiente. */
  total: number;
  /** Pagos efectivos: los inmediatos y los compromisos ya pagados. */
  pagado: number;
  /** Compromisos todavia no pagados. */
  pendiente: number;
  /** Cuantos de los movimientos son compromisos sin pagar. */
  movimientosPendientes: number;
};

/** Monto de un gasto: el total cuando existe, si no el monto simple. */
export const montoDeGasto = (gasto: Gasto): number => {
  const valor = gasto.montoTotal ?? gasto.monto;
  return Number.isFinite(valor) ? Number(valor) : 0;
};

/** Un compromiso cuenta como pendiente mientras no este marcado como pagado. */
export const esPendiente = (gasto: Gasto): boolean =>
  gasto.origen === 'COMPROMISO' && gasto.pagado !== true;

/** Totales del conjunto de gastos recibido, sin paginar. */
export function resumirGastos(gastos: Gasto[]): ResumenGastos {
  return gastos.reduce<ResumenGastos>(
    (acumulado, gasto) => {
      const monto = montoDeGasto(gasto);
      const pendiente = esPendiente(gasto);

      return {
        movimientos: acumulado.movimientos + 1,
        total: acumulado.total + monto,
        pagado: acumulado.pagado + (pendiente ? 0 : monto),
        pendiente: acumulado.pendiente + (pendiente ? monto : 0),
        movimientosPendientes: acumulado.movimientosPendientes + (pendiente ? 1 : 0),
      };
    },
    { movimientos: 0, total: 0, pagado: 0, pendiente: 0, movimientosPendientes: 0 },
  );
}
