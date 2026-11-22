/**
 * Catalogo de series del grafico "Gastos versus cobros".
 *
 * Vive aparte del componente para poder probarlo y para que el archivo del
 * grafico exporte solo el componente.
 */

export const COLOR_GASTOS = 'hsl(213, 94%, 54%)';
export const COLOR_COBROS = 'hsl(152, 61%, 38%)';
export const COLOR_GASTOS_ACUMULADOS = 'hsl(243, 75%, 59%)';
export const COLOR_COBROS_ACUMULADOS = 'hsl(173, 80%, 30%)';
export const COLOR_APORTE = 'hsl(32, 95%, 44%)';

export const EJE_MENSUAL = 'mensual';
export const EJE_ACUMULADO = 'acumulado';

export type EjeSerie = typeof EJE_MENSUAL | typeof EJE_ACUMULADO;

export type ClaveSerie =
  | 'gastos'
  | 'cobros'
  | 'promedioGastos'
  | 'promedioCobros'
  | 'gastosAcumulados'
  | 'cobrosAcumulados'
  | 'aporteAcumulado';

export type Serie = {
  clave: ClaveSerie;
  etiqueta: string;
  color: string;
  eje: EjeSerie;
  /** 'referencia' es una linea horizontal constante, no un valor por mes. */
  forma: 'barra' | 'linea' | 'referencia';
};

export const SERIES: Serie[] = [
  { clave: 'gastos', etiqueta: 'Gastos del mes', color: COLOR_GASTOS, eje: EJE_MENSUAL, forma: 'barra' },
  { clave: 'cobros', etiqueta: 'Cobros del mes', color: COLOR_COBROS, eje: EJE_MENSUAL, forma: 'linea' },
  { clave: 'promedioGastos', etiqueta: 'Promedio de gastos', color: COLOR_GASTOS, eje: EJE_MENSUAL, forma: 'referencia' },
  { clave: 'promedioCobros', etiqueta: 'Promedio de cobros', color: COLOR_COBROS, eje: EJE_MENSUAL, forma: 'referencia' },
  { clave: 'gastosAcumulados', etiqueta: 'Gastos acumulados', color: COLOR_GASTOS_ACUMULADOS, eje: EJE_ACUMULADO, forma: 'linea' },
  { clave: 'cobrosAcumulados', etiqueta: 'Cobros acumulados', color: COLOR_COBROS_ACUMULADOS, eje: EJE_ACUMULADO, forma: 'linea' },
  { clave: 'aporteAcumulado', etiqueta: 'Aporte de REKOSOL', color: COLOR_APORTE, eje: EJE_ACUMULADO, forma: 'linea' },
];

/** Lo que se ve al entrar: el mes a mes contra su promedio. */
export const SERIES_POR_DEFECTO: ClaveSerie[] = ['gastos', 'cobros', 'promedioGastos', 'promedioCobros'];

export const ETIQUETAS_SERIE = new Map(SERIES.map((serie) => [serie.clave, serie.etiqueta]));

/** Las series encendidas, en el orden del catalogo. */
export function seriesVisibles(claves: ClaveSerie[]): Serie[] {
  return SERIES.filter((serie) => claves.includes(serie.clave));
}

/** Que ejes hay que dibujar. Un eje sin series rompe el grafico. */
export function ejesNecesarios(claves: ClaveSerie[]): { mensual: boolean; acumulado: boolean } {
  const visibles = seriesVisibles(claves);

  return {
    mensual: visibles.some((serie) => serie.eje === EJE_MENSUAL),
    acumulado: visibles.some((serie) => serie.eje === EJE_ACUMULADO),
  };
}
