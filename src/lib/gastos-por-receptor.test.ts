import { describe, expect, it } from 'vitest';
import {
  agruparPorReceptor,
  buscarReceptores,
  filtrarGastos,
  filtrarPorCategoria,
  ordenarReceptores,
  SIN_CLASIFICAR,
  SIN_RECEPTOR,
  totalizarReceptores,
  type CatalogosReceptor,
} from './gastos-por-receptor';
import type { Empresa, Gasto } from '@/data/mockData';

const gasto = (parcial: Partial<Gasto>): Gasto => ({
  id: 'gasto',
  fecha: '2026-10-28',
  empresaId: 'sodimac',
  categoria: 'materiales',
  tipoDocumento: 'factura',
  numeroDocumento: 'F-1',
  monto: 1000,
  montoTotal: 1000,
  proyectoId: 'coyhaique',
  ...parcial,
}) as Gasto;

const empresa = (parcial: Partial<Empresa>): Empresa => ({
  id: 'sodimac',
  razonSocial: 'SODIMAC',
  rut: '96.792.430-K',
  categoria: 'Empresa',
  createdAt: '2026-01-01',
  ...parcial,
}) as Empresa;

const catalogos: CatalogosReceptor = {
  empresas: [
    empresa({}),
    empresa({ id: 'jose', razonSocial: 'JOSE RUIZ', rut: '4689468-5', categoria: 'Persona Natural' }),
    empresa({ id: 'comida', razonSocial: 'COMIDA', rut: '', categoria: 'Sin individualizar' }),
  ],
  proyectos: [
    { id: 'coyhaique', nombre: 'CON-PR20-COYHAIQUE' },
    { id: 'castro', nombre: 'CON-PR21-CASTRO' },
  ],
  categorias: [
    { id: 'materiales', nombre: 'MATERIALES' },
    { id: 'fletes', nombre: 'FLETES' },
  ],
};

describe('filtrarGastos', () => {
  const gastos = [
    gasto({ id: '1', proyectoId: 'coyhaique', fecha: '2026-10-28' }),
    gasto({ id: '2', proyectoId: 'castro', fecha: '2026-09-01' }),
  ];

  it('no filtra nada con el proyecto en all', () => {
    expect(filtrarGastos(gastos, { proyectoId: 'all' })).toHaveLength(2);
  });

  it('deja solo el proyecto pedido', () => {
    expect(filtrarGastos(gastos, { proyectoId: 'castro' }).map((g) => g.id)).toEqual(['2']);
  });

  it('respeta el rango de fechas', () => {
    expect(filtrarGastos(gastos, { desde: '2026-10-01' }).map((g) => g.id)).toEqual(['1']);
    expect(filtrarGastos(gastos, { hasta: '2026-09-30' }).map((g) => g.id)).toEqual(['2']);
  });

  it('usa la fecha de compromiso cuando el gasto no tiene fecha', () => {
    const compromiso = gasto({ id: '3', fecha: '', fechaCompromiso: '2026-12-01' });
    expect(filtrarGastos([compromiso], { desde: '2026-11-01' })).toHaveLength(1);
  });
});

describe('agruparPorReceptor', () => {
  it('separa los pagos efectivos de los compromisos pendientes', () => {
    const receptores = agruparPorReceptor(
      [gasto({ id: '1', montoTotal: 1000 }), gasto({ id: '2', montoTotal: 2500 })],
      [gasto({ id: '3', montoTotal: 500, origen: 'COMPROMISO', pagado: false })],
      catalogos,
    );

    expect(receptores).toHaveLength(1);
    expect(receptores[0]).toMatchObject({
      nombre: 'SODIMAC',
      pagado: 3500,
      pendiente: 500,
      movimientos: 3,
      movimientosPendientes: 1,
    });
  });

  it('agrupa por receptor, no por quien registra ni por quien rinde', () => {
    const receptores = agruparPorReceptor(
      [
        gasto({ id: '1', empresaId: 'sodimac', colaboradorNombre: 'Camilo', creadoPorNombre: 'Gerardo' }),
        gasto({ id: '2', empresaId: 'sodimac', colaboradorNombre: 'Rodrigo', creadoPorNombre: 'Camilo' }),
      ],
      [],
      catalogos,
    );

    expect(receptores).toHaveLength(1);
    expect(receptores[0].movimientosDetalle.map((m) => m.rendidoPor)).toEqual(['Camilo', 'Rodrigo']);
    expect(receptores[0].movimientosDetalle.map((m) => m.registradoPor)).toEqual(['Gerardo', 'Camilo']);
  });

  it('distribuye por proyecto y por categoria', () => {
    const receptores = agruparPorReceptor(
      [
        gasto({ id: '1', proyectoId: 'coyhaique', categoria: 'materiales', montoTotal: 1000 }),
        gasto({ id: '2', proyectoId: 'castro', categoria: 'materiales', montoTotal: 3000 }),
        gasto({ id: '3', proyectoId: 'castro', categoria: 'fletes', montoTotal: 500 }),
      ],
      [],
      catalogos,
    );

    expect(receptores[0].porProyecto).toEqual([
      { id: 'castro', nombre: 'CON-PR21-CASTRO', pagado: 3500, pendiente: 0, movimientos: 2 },
      { id: 'coyhaique', nombre: 'CON-PR20-COYHAIQUE', pagado: 1000, pendiente: 0, movimientos: 1 },
    ]);
    expect(receptores[0].porCategoria.map((fila) => fila.nombre)).toEqual(['MATERIALES', 'FLETES']);
  });

  it('ordena los movimientos del mas reciente al mas antiguo', () => {
    const receptores = agruparPorReceptor(
      [
        gasto({ id: 'viejo', fecha: '2026-01-05' }),
        gasto({ id: 'nuevo', fecha: '2026-10-28' }),
      ],
      [],
      catalogos,
    );

    expect(receptores[0].movimientosDetalle.map((m) => m.gasto.id)).toEqual(['nuevo', 'viejo']);
    expect(receptores[0].ultimaFecha).toBe('2026-10-28');
  });

  it('junta en un grupo propio los gastos sin receptor', () => {
    const receptores = agruparPorReceptor([gasto({ id: '1', empresaId: null })], [], catalogos);

    expect(receptores[0].nombre).toBe(SIN_RECEPTOR);
    expect(receptores[0].empresaId).toBeNull();
    expect(receptores[0].categoria).toBe(SIN_CLASIFICAR);
  });

  it('marca como sin clasificar al receptor cuya empresa no tiene categoria', () => {
    const sinCategoria = { ...catalogos, empresas: [empresa({ categoria: undefined })] };
    const receptores = agruparPorReceptor([gasto({ id: '1' })], [], sinCategoria);

    expect(receptores[0].categoria).toBe(SIN_CLASIFICAR);
  });

  it('nombra los conceptos faltantes en vez de dejarlos vacios', () => {
    const receptores = agruparPorReceptor(
      [gasto({ id: '1', proyectoId: undefined, categoria: '' })],
      [],
      catalogos,
    );

    expect(receptores[0].porProyecto[0].nombre).toBe('Sin proyecto');
    expect(receptores[0].porCategoria[0].nombre).toBe('Sin categoria');
  });

  it('cuenta los respaldos de cada movimiento', () => {
    const conAdjunto = gasto({
      id: '1',
      archivosAdjuntos: [{ nombre: 'Gasto general 2.jpg', url: '/api/documentos/1/contenido', tipo: 'image/jpeg' }],
    });
    const receptores = agruparPorReceptor([conAdjunto], [], catalogos);

    expect(receptores[0].movimientosDetalle[0].adjuntos).toBe(1);
  });
});

describe('buscarReceptores', () => {
  const receptores = agruparPorReceptor(
    [gasto({ id: '1', empresaId: 'sodimac' }), gasto({ id: '2', empresaId: 'jose' })],
    [],
    catalogos,
  );

  it('devuelve todo con la busqueda vacia', () => {
    expect(buscarReceptores(receptores, '  ')).toHaveLength(2);
  });

  it('busca por nombre sin importar mayusculas ni acentos', () => {
    expect(buscarReceptores(receptores, 'jose').map((r) => r.nombre)).toEqual(['JOSE RUIZ']);
  });

  it('busca por RUT aunque se escriba con puntos y guion', () => {
    expect(buscarReceptores(receptores, '4.689.468-5').map((r) => r.nombre)).toEqual(['JOSE RUIZ']);
    expect(buscarReceptores(receptores, '96792430').map((r) => r.nombre)).toEqual(['SODIMAC']);
  });
});

describe('filtrarPorCategoria', () => {
  const receptores = agruparPorReceptor(
    [
      gasto({ id: '1', empresaId: 'sodimac' }),
      gasto({ id: '2', empresaId: 'jose' }),
      gasto({ id: '3', empresaId: 'comida' }),
    ],
    [],
    catalogos,
  );

  it('no filtra con all', () => {
    expect(filtrarPorCategoria(receptores, 'all')).toHaveLength(3);
  });

  it('deja solo la categoria pedida', () => {
    expect(filtrarPorCategoria(receptores, 'Persona Natural').map((r) => r.nombre)).toEqual(['JOSE RUIZ']);
    expect(filtrarPorCategoria(receptores, 'Sin individualizar').map((r) => r.nombre)).toEqual(['COMIDA']);
  });
});

describe('ordenarReceptores', () => {
  const receptores = agruparPorReceptor(
    [
      gasto({ id: '1', empresaId: 'sodimac', montoTotal: 1000, fecha: '2026-01-01' }),
      gasto({ id: '2', empresaId: 'jose', montoTotal: 5000, fecha: '2026-10-28' }),
      gasto({ id: '3', empresaId: 'jose', montoTotal: 100, fecha: '2026-10-29' }),
    ],
    [gasto({ id: '4', empresaId: 'sodimac', montoTotal: 9000, origen: 'COMPROMISO', pagado: false })],
    catalogos,
  );

  it('ordena por pagado de mayor a menor', () => {
    expect(ordenarReceptores(receptores, 'pagado').map((r) => r.nombre)).toEqual(['JOSE RUIZ', 'SODIMAC']);
  });

  it('ordena por pendiente', () => {
    expect(ordenarReceptores(receptores, 'pendiente').map((r) => r.nombre)).toEqual(['SODIMAC', 'JOSE RUIZ']);
  });

  it('ordena por cantidad de movimientos', () => {
    expect(ordenarReceptores(receptores, 'movimientos').map((r) => r.nombre)).toEqual(['JOSE RUIZ', 'SODIMAC']);
  });

  it('ordena por nombre', () => {
    expect(ordenarReceptores(receptores, 'nombre').map((r) => r.nombre)).toEqual(['JOSE RUIZ', 'SODIMAC']);
  });

  it('ordena por movimiento mas reciente', () => {
    expect(ordenarReceptores(receptores, 'reciente').map((r) => r.nombre)).toEqual(['JOSE RUIZ', 'SODIMAC']);
  });

  it('no altera la lista recibida', () => {
    const original = receptores.map((r) => r.nombre);
    ordenarReceptores(receptores, 'nombre');
    expect(receptores.map((r) => r.nombre)).toEqual(original);
  });
});

describe('totalizarReceptores', () => {
  it('suma todos los receptores visibles', () => {
    const receptores = agruparPorReceptor(
      [gasto({ id: '1', empresaId: 'sodimac', montoTotal: 1000 }), gasto({ id: '2', empresaId: 'jose', montoTotal: 2000 })],
      [gasto({ id: '3', empresaId: 'jose', montoTotal: 500, origen: 'COMPROMISO', pagado: false })],
      catalogos,
    );

    expect(totalizarReceptores(receptores)).toEqual({
      receptores: 2,
      movimientos: 3,
      pagado: 3000,
      pendiente: 500,
    });
  });

  it('devuelve ceros sin receptores', () => {
    expect(totalizarReceptores([])).toEqual({ receptores: 0, movimientos: 0, pagado: 0, pendiente: 0 });
  });
});
