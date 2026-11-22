import { describe, expect, it } from 'vitest';
import {
  EJE_ACUMULADO,
  EJE_MENSUAL,
  ejesNecesarios,
  ETIQUETAS_SERIE,
  SERIES,
  SERIES_POR_DEFECTO,
  seriesVisibles,
} from './reportes-series';

describe('catalogo de series', () => {
  it('tiene las siete series del grafico', () => {
    expect(SERIES.map((serie) => serie.clave)).toEqual([
      'gastos',
      'cobros',
      'promedioGastos',
      'promedioCobros',
      'gastosAcumulados',
      'cobrosAcumulados',
      'aporteAcumulado',
    ]);
  });

  it('arranca con el mes a mes y sus promedios', () => {
    expect(SERIES_POR_DEFECTO).toEqual(['gastos', 'cobros', 'promedioGastos', 'promedioCobros']);
  });

  it('los acumulados van en el eje de la derecha', () => {
    const acumuladas = SERIES.filter((serie) => serie.eje === EJE_ACUMULADO).map((serie) => serie.clave);
    expect(acumuladas).toEqual(['gastosAcumulados', 'cobrosAcumulados', 'aporteAcumulado']);
  });

  it('los promedios son lineas de referencia, no series por mes', () => {
    const referencias = SERIES.filter((serie) => serie.forma === 'referencia').map((serie) => serie.clave);
    expect(referencias).toEqual(['promedioGastos', 'promedioCobros']);
  });

  it('cada serie tiene etiqueta', () => {
    for (const serie of SERIES) {
      expect(ETIQUETAS_SERIE.get(serie.clave)).toBe(serie.etiqueta);
    }
  });
});

describe('seriesVisibles', () => {
  it('devuelve las encendidas en el orden del catalogo', () => {
    expect(seriesVisibles(['cobros', 'gastos']).map((serie) => serie.clave)).toEqual(['gastos', 'cobros']);
  });

  it('devuelve vacio sin seleccion', () => {
    expect(seriesVisibles([])).toEqual([]);
  });
});

describe('ejesNecesarios', () => {
  it('pide solo el eje mensual con el mes a mes', () => {
    expect(ejesNecesarios(['gastos', 'promedioCobros'])).toEqual({ mensual: true, acumulado: false });
  });

  it('pide solo el eje acumulado con los acumulados', () => {
    expect(ejesNecesarios(['aporteAcumulado'])).toEqual({ mensual: false, acumulado: true });
  });

  it('pide los dos ejes cuando se mezclan', () => {
    expect(ejesNecesarios(['gastos', 'gastosAcumulados'])).toEqual({ mensual: true, acumulado: true });
  });

  it('no pide ningun eje sin series', () => {
    expect(ejesNecesarios([])).toEqual({ mensual: false, acumulado: false });
  });

  it('el eje mensual sirve a las lineas de referencia', () => {
    const promedio = SERIES.find((serie) => serie.clave === 'promedioGastos');
    expect(promedio?.eje).toBe(EJE_MENSUAL);
  });
});
