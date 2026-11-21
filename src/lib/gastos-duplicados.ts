import { formatCurrency, formatDate, type Colaborador, type Empresa, type Gasto, type Proyecto } from '@/data/mockData';

export type Categoria = { id: string; nombre: string };
export type TipoDocumento = { id: string; nombre: string };

export type Catalogos = {
  empresas: Empresa[];
  proyectos: Proyecto[];
  categorias: Categoria[];
  tiposDocumento: TipoDocumento[];
  colaboradores: Colaborador[];
};

export const CATALOGOS_VACIOS: Catalogos = {
  empresas: [],
  proyectos: [],
  categorias: [],
  tiposDocumento: [],
  colaboradores: [],
};

export type FilaComparacion = {
  etiqueta: string;
  valores: string[];
  iguales: boolean;
  /** Dato de carga, no del gasto: difiere siempre, asi que no cuenta como diferencia. */
  metadato: boolean;
};

/** Texto legible de la distancia entre la primera y la ultima carga del grupo. */
export function describirSeparacion(primera?: string | null, ultima?: string | null): string {
  if (!primera || !ultima) return 'Sin datos de carga';

  const desde = new Date(primera).getTime();
  const hasta = new Date(ultima).getTime();
  if (Number.isNaN(desde) || Number.isNaN(hasta)) return 'Sin datos de carga';

  const segundos = Math.round((hasta - desde) / 1000);
  if (segundos < 60) return `Cargados con ${segundos} s de diferencia`;

  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `Cargados con ${minutos} min de diferencia`;

  const horas = Math.round(minutos / 60);
  if (horas < 48) return `Cargados con ${horas} h de diferencia`;

  return `Cargados con ${Math.round(horas / 24)} dias de diferencia`;
}

export function formatearTamano(bytes?: number): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const formatearMonto = (valor?: number | null) =>
  valor === undefined || valor === null ? '-' : formatCurrency(valor);

type FilaComparacion = {
  etiqueta: string;
  valores: string[];
  iguales: boolean;
  /** Dato de carga, no del gasto: difiere siempre, asi que no cuenta como diferencia. */
  metadato: boolean;
};

/** Construye la comparacion campo a campo y marca cuales difieren entre copias. */
export function construirComparacion(gastos: Gasto[], catalogos: Catalogos): FilaComparacion[] {
  const nombre = (lista: Array<{ id: string; nombre?: string; razonSocial?: string }>, id?: string | null) => {
    if (!id) return '-';
    const encontrado = lista.find((item) => String(item.id) === String(id));
    return encontrado?.nombre || encontrado?.razonSocial || String(id);
  };

  const definiciones: Array<{ etiqueta: string; valor: (gasto: Gasto) => string; metadato?: boolean }> = [
    { etiqueta: 'Fecha', valor: (gasto) => formatDate(gasto.fecha) },
    { etiqueta: 'Empresa', valor: (gasto) => nombre(catalogos.empresas, gasto.empresaId) },
    { etiqueta: 'Proyecto', valor: (gasto) => nombre(catalogos.proyectos, gasto.proyectoId) },
    { etiqueta: 'Categoria', valor: (gasto) => nombre(catalogos.categorias, gasto.categoria) },
    { etiqueta: 'Tipo documento', valor: (gasto) => nombre(catalogos.tiposDocumento, gasto.tipoDocumento) },
    { etiqueta: 'N documento', valor: (gasto) => gasto.numeroDocumento || '-' },
    { etiqueta: 'Monto neto', valor: (gasto) => formatearMonto(gasto.montoNeto) },
    { etiqueta: 'IVA', valor: (gasto) => formatearMonto(gasto.iva) },
    { etiqueta: 'Monto total', valor: (gasto) => formatearMonto(gasto.montoTotal ?? gasto.monto) },
    { etiqueta: 'Origen', valor: (gasto) => (gasto.origen === 'COMPROMISO' ? 'Comprometido' : 'Inmediato') },
    { etiqueta: 'Detalle', valor: (gasto) => gasto.detalle || '-' },
    {
      etiqueta: 'Adjuntos',
      valor: (gasto) =>
        (gasto.archivosAdjuntos || [])
          .map((archivo) => `${archivo.nombre}${archivo.tamano ? ` (${formatearTamano(archivo.tamano)})` : ''}`)
          .join(', ') || 'Sin adjuntos',
    },
    { etiqueta: 'Cargado por', valor: (gasto) => gasto.creadoPorNombre || '-', metadato: true },
    {
      etiqueta: 'Cargado el',
      valor: (gasto) => (gasto.createdAt ? new Date(gasto.createdAt).toLocaleString('es-CL') : '-'),
      metadato: true,
    },
  ];

  return definiciones.map((definicion) => {
    const valores = gastos.map(definicion.valor);
    return {
      etiqueta: definicion.etiqueta,
      valores,
      iguales: valores.every((valor) => valor === valores[0]),
      metadato: Boolean(definicion.metadato),
    };
  });
}


/** Identificador de un intento de guardado, estable entre reintentos. */
export function nuevoIntentoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Respaldo para entornos sin crypto.randomUUID (jsdom antiguo, navegadores viejos).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (caracter) => {
    const aleatorio = (Math.random() * 16) | 0;
    const valor = caracter === 'x' ? aleatorio : (aleatorio & 0x3) | 0x8;
    return valor.toString(16);
  });
}
