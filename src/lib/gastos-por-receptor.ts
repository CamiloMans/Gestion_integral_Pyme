import type { CategoriaEmpresa, Empresa, Gasto } from '@/data/mockData';
import { montoDeGasto } from './gastos-resumen';

/** Receptor del gasto cuya empresa no tiene categoria escrita todavia. */
export const SIN_CLASIFICAR = 'Sin clasificar';

/** Gastos que no apuntan a ningun receptor. */
export const SIN_RECEPTOR = 'Sin receptor';

export type CategoriaReceptor = CategoriaEmpresa | typeof SIN_CLASIFICAR;

export type OpcionCatalogo = { id: string; nombre: string };

/** Un corte del gasto de un receptor: por proyecto o por categoria. */
export type DistribucionReceptor = {
  id: string | null;
  nombre: string;
  pagado: number;
  pendiente: number;
  movimientos: number;
};

/**
 * Un movimiento del receptor con los nombres ya resueltos. Separa a quien rinde
 * el gasto (el colaborador) de quien lo registra en el sistema (el usuario),
 * porque ninguno de los dos es el receptor del pago.
 */
export type MovimientoReceptor = {
  gasto: Gasto;
  monto: number;
  pendiente: boolean;
  proyectoId: string | null;
  proyectoNombre: string;
  categoriaId: string | null;
  categoriaNombre: string;
  rendidoPor: string | null;
  registradoPor: string | null;
  adjuntos: number;
};

export type ResumenReceptor = {
  empresaId: string | null;
  nombre: string;
  rut: string;
  categoria: CategoriaReceptor;
  /** Pagos efectivos. */
  pagado: number;
  /** Compromisos todavia no pagados. */
  pendiente: number;
  movimientos: number;
  movimientosPendientes: number;
  /** Fecha del movimiento mas reciente, en formato YYYY-MM-DD. */
  ultimaFecha: string | null;
  porProyecto: DistribucionReceptor[];
  porCategoria: DistribucionReceptor[];
  movimientosDetalle: MovimientoReceptor[];
};

export type TotalesReceptores = {
  receptores: number;
  movimientos: number;
  pagado: number;
  pendiente: number;
};

export type FiltroReceptores = {
  proyectoId?: string;
  desde?: string;
  hasta?: string;
};

export type CatalogosReceptor = {
  empresas: Empresa[];
  proyectos: OpcionCatalogo[];
  categorias: OpcionCatalogo[];
};

export type OrdenReceptores = 'pagado' | 'pendiente' | 'movimientos' | 'nombre' | 'reciente';

const indexar = (opciones: OpcionCatalogo[]) =>
  new Map(opciones.map((opcion) => [opcion.id, opcion.nombre]));

/** Deja solo digitos y K para poder comparar RUT escritos de distintas formas. */
const normalizarRut = (valor?: string | null) =>
  (valor ?? '').toUpperCase().replace(/[^0-9K]/g, '');

const normalizarTexto = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** La fecha del gasto, o la del compromiso cuando el gasto todavia no se paga. */
export const fechaDeGasto = (gasto: Gasto): string | null =>
  gasto.fecha || gasto.fechaCompromiso || null;

/** Recorta el conjunto antes de agrupar, para que los totales respeten el filtro. */
export function filtrarGastos(gastos: Gasto[], filtro: FiltroReceptores = {}): Gasto[] {
  const { proyectoId, desde, hasta } = filtro;

  return gastos.filter((gasto) => {
    if (proyectoId && proyectoId !== 'all' && gasto.proyectoId !== proyectoId) return false;

    const fecha = fechaDeGasto(gasto);
    if (desde && (!fecha || fecha < desde)) return false;
    if (hasta && (!fecha || fecha > hasta)) return false;

    return true;
  });
}

type Acumulador = {
  mapa: Map<string, DistribucionReceptor>;
  orden: string[];
};

const acumularEn = (
  acumulador: Acumulador,
  id: string | null,
  nombre: string,
  monto: number,
  pendiente: boolean,
) => {
  const clave = id ?? '';
  let fila = acumulador.mapa.get(clave);

  if (!fila) {
    fila = { id, nombre, pagado: 0, pendiente: 0, movimientos: 0 };
    acumulador.mapa.set(clave, fila);
    acumulador.orden.push(clave);
  }

  fila.movimientos += 1;
  if (pendiente) fila.pendiente += monto;
  else fila.pagado += monto;
};

const ordenarDistribucion = (acumulador: Acumulador): DistribucionReceptor[] =>
  acumulador.orden
    .map((clave) => acumulador.mapa.get(clave) as DistribucionReceptor)
    .sort((a, b) => b.pagado + b.pendiente - (a.pagado + a.pendiente) || a.nombre.localeCompare(b.nombre));

/**
 * Agrupa los movimientos por receptor del pago.
 *
 * `pagados` son los pagos efectivos y `pendientes` los compromisos sin pagar;
 * llegan por separado porque el servidor los expone en endpoints distintos.
 */
export function agruparPorReceptor(
  pagados: Gasto[],
  pendientes: Gasto[],
  catalogos: CatalogosReceptor,
): ResumenReceptor[] {
  const empresas = new Map(catalogos.empresas.map((empresa) => [empresa.id, empresa]));
  const nombreProyecto = indexar(catalogos.proyectos);
  const nombreCategoria = indexar(catalogos.categorias);

  type Grupo = {
    resumen: ResumenReceptor;
    proyectos: Acumulador;
    categorias: Acumulador;
  };

  const grupos = new Map<string, Grupo>();

  const procesar = (gasto: Gasto, pendiente: boolean) => {
    const empresaId = gasto.empresaId ?? null;
    const clave = empresaId ?? '';
    const empresa = empresaId ? empresas.get(empresaId) : undefined;

    let grupo = grupos.get(clave);

    if (!grupo) {
      grupo = {
        resumen: {
          empresaId,
          nombre: empresa?.razonSocial || (empresaId ? 'Receptor desconocido' : SIN_RECEPTOR),
          rut: empresa?.rut || '',
          categoria: empresa?.categoria ?? SIN_CLASIFICAR,
          pagado: 0,
          pendiente: 0,
          movimientos: 0,
          movimientosPendientes: 0,
          ultimaFecha: null,
          porProyecto: [],
          porCategoria: [],
          movimientosDetalle: [],
        },
        proyectos: { mapa: new Map(), orden: [] },
        categorias: { mapa: new Map(), orden: [] },
      };
      grupos.set(clave, grupo);
    }

    const monto = montoDeGasto(gasto);
    const proyectoId = gasto.proyectoId ?? null;
    const categoriaId = gasto.categoria ?? null;
    const proyectoNombre = proyectoId ? nombreProyecto.get(proyectoId) || 'Proyecto desconocido' : 'Sin proyecto';
    const categoriaNombre = categoriaId ? nombreCategoria.get(categoriaId) || 'Categoria desconocida' : 'Sin categoria';
    const fecha = fechaDeGasto(gasto);

    grupo.resumen.movimientos += 1;
    if (pendiente) {
      grupo.resumen.pendiente += monto;
      grupo.resumen.movimientosPendientes += 1;
    } else {
      grupo.resumen.pagado += monto;
    }

    if (fecha && (!grupo.resumen.ultimaFecha || fecha > grupo.resumen.ultimaFecha)) {
      grupo.resumen.ultimaFecha = fecha;
    }

    acumularEn(grupo.proyectos, proyectoId, proyectoNombre, monto, pendiente);
    acumularEn(grupo.categorias, categoriaId, categoriaNombre, monto, pendiente);

    grupo.resumen.movimientosDetalle.push({
      gasto,
      monto,
      pendiente,
      proyectoId,
      proyectoNombre,
      categoriaId,
      categoriaNombre,
      rendidoPor: gasto.colaboradorNombre || null,
      registradoPor: gasto.creadoPorNombre || null,
      adjuntos: gasto.archivosAdjuntos?.length ?? 0,
    });
  };

  for (const gasto of pagados) procesar(gasto, false);
  for (const gasto of pendientes) procesar(gasto, true);

  return [...grupos.values()].map((grupo) => {
    grupo.resumen.porProyecto = ordenarDistribucion(grupo.proyectos);
    grupo.resumen.porCategoria = ordenarDistribucion(grupo.categorias);
    grupo.resumen.movimientosDetalle.sort((a, b) => {
      const fechaA = fechaDeGasto(a.gasto) ?? '';
      const fechaB = fechaDeGasto(b.gasto) ?? '';
      return fechaB.localeCompare(fechaA) || b.monto - a.monto;
    });

    return grupo.resumen;
  });
}

/** Busca por nombre o por RUT. El RUT se compara sin puntos ni guion. */
export function buscarReceptores(receptores: ResumenReceptor[], texto: string): ResumenReceptor[] {
  const termino = texto.trim();
  if (!termino) return receptores;

  const porNombre = normalizarTexto(termino);
  const porRut = normalizarRut(termino);

  return receptores.filter((receptor) => {
    if (normalizarTexto(receptor.nombre).includes(porNombre)) return true;
    return porRut.length >= 2 && normalizarRut(receptor.rut).includes(porRut);
  });
}

export function filtrarPorCategoria(
  receptores: ResumenReceptor[],
  categoria: CategoriaReceptor | 'all',
): ResumenReceptor[] {
  if (categoria === 'all') return receptores;
  return receptores.filter((receptor) => receptor.categoria === categoria);
}

export function ordenarReceptores(
  receptores: ResumenReceptor[],
  orden: OrdenReceptores,
): ResumenReceptor[] {
  const copia = [...receptores];

  switch (orden) {
    case 'nombre':
      return copia.sort((a, b) => a.nombre.localeCompare(b.nombre));
    case 'pendiente':
      return copia.sort((a, b) => b.pendiente - a.pendiente || a.nombre.localeCompare(b.nombre));
    case 'movimientos':
      return copia.sort((a, b) => b.movimientos - a.movimientos || a.nombre.localeCompare(b.nombre));
    case 'reciente':
      return copia.sort((a, b) => (b.ultimaFecha ?? '').localeCompare(a.ultimaFecha ?? '') || a.nombre.localeCompare(b.nombre));
    case 'pagado':
    default:
      return copia.sort((a, b) => b.pagado - a.pagado || a.nombre.localeCompare(b.nombre));
  }
}

export function totalizarReceptores(receptores: ResumenReceptor[]): TotalesReceptores {
  return receptores.reduce<TotalesReceptores>(
    (acumulado, receptor) => ({
      receptores: acumulado.receptores + 1,
      movimientos: acumulado.movimientos + receptor.movimientos,
      pagado: acumulado.pagado + receptor.pagado,
      pendiente: acumulado.pendiente + receptor.pendiente,
    }),
    { receptores: 0, movimientos: 0, pagado: 0, pendiente: 0 },
  );
}
