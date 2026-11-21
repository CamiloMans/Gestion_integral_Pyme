import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GastosDuplicados from './GastosDuplicados';
import { construirComparacion, describirSeparacion, formatearTamano } from '@/lib/gastos-duplicados';
import { postgresApi } from '@/services/postgresApi';
import type { Gasto } from '@/data/mockData';

vi.mock('@/hooks/useAppAuth', () => ({
  useAppAuth: () => ({
    session: {
      role: 'admin',
      permissions: ['expenses.records'],
      user: { id: 'user-1', nombre: 'Tester', email: 'tester@rekosol.cl' },
    },
  }),
}));

vi.mock('@/components/AppSessionMenu', () => ({ AppSessionMenu: () => <div /> }));

// Reemplaza el dialogo por un boton directo: asi el test puede confirmar el borrado.
vi.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? <button type="button" onClick={onConfirm}>confirmar-eliminacion</button> : null,
}));

vi.mock('@/services/postgresApi', () => ({
  postgresApi: {
    getBootstrap: vi.fn(),
    getGastosDuplicados: vi.fn(),
    setDescarteDuplicado: vi.fn(),
    deleteGasto: vi.fn(),
  },
}));

const bootstrap = {
  tenant: { id: 'tenant-1', slug: 'rekosol', nombre: 'Rekosol' },
  empresas: [{ id: 'empresa-1', razonSocial: 'SODIMAC', rut: '96.792.430-K', createdAt: '2026-01-01' }],
  proyectos: [{ id: 'proyecto-1', nombre: 'CON-PR20-COYHAIQUE', createdAt: '2026-01-01' }],
  categorias: [{ id: 'categoria-1', nombre: 'MATERIALES', color: 'bg-blue-500' }],
  tiposDocumento: [{ id: 'tipo-1', nombre: 'FACTURA', tieneImpuestos: true, valorImpuestos: 0.19 }],
  colaboradores: [],
};

const gastoBase: Gasto = {
  id: 'gasto-1',
  fecha: '2026-10-28',
  empresaId: 'empresa-1',
  proyectoId: 'proyecto-1',
  categoria: 'categoria-1',
  tipoDocumento: 'tipo-1',
  numeroDocumento: '150554944',
  monto: 39364,
  montoNeto: 33079,
  iva: 6285,
  montoTotal: 39364,
  detalle: 'ADHESIVO Y CONEXIONES',
  origen: 'INMEDIATO',
  createdAt: '2026-10-29T21:06:48.780Z',
  creadoPorNombre: 'Gerardo Soto',
  archivosAdjuntos: [{ id: 'doc-1', nombre: 'Gasto general 2.jpg', url: '/api/documentos/doc-1/contenido', tipo: 'image/jpeg', tamano: 1352485 }],
};

const grupo = {
  firma: 'gasto-1|gasto-2',
  empresaId: 'empresa-1',
  empresaNombre: 'SODIMAC',
  numeroDocumento: '150554944',
  fecha: '2026-10-28',
  montoTotal: 39364,
  primeraCarga: '2026-10-29T21:06:48.780Z',
  ultimaCarga: '2026-10-29T21:09:14.811Z',
  descartado: false,
  descartadoEn: null,
  descartadoPorNombre: null,
  gastos: [
    gastoBase,
    { ...gastoBase, id: 'gasto-2', createdAt: '2026-10-29T21:09:14.811Z' },
  ],
};

const catalogos = {
  empresas: bootstrap.empresas,
  proyectos: bootstrap.proyectos,
  categorias: bootstrap.categorias,
  tiposDocumento: bootstrap.tiposDocumento,
  colaboradores: [],
};

const renderPagina = () =>
  render(<MemoryRouter initialEntries={['/gastos/duplicados']}><GastosDuplicados /></MemoryRouter>);

describe('describirSeparacion', () => {
  it('describe segundos, minutos y dias', () => {
    expect(describirSeparacion('2026-10-29T21:06:48Z', '2026-10-29T21:06:53Z')).toBe('Cargados con 5 s de diferencia');
    expect(describirSeparacion('2026-10-29T21:06:48Z', '2026-10-29T21:09:14Z')).toBe('Cargados con 2 min de diferencia');
    expect(describirSeparacion('2026-08-21T10:00:00Z', '2026-08-30T10:00:00Z')).toBe('Cargados con 9 dias de diferencia');
  });

  it('tolera fechas ausentes', () => {
    expect(describirSeparacion(null, null)).toBe('Sin datos de carga');
  });
});

describe('formatearTamano', () => {
  it('usa la unidad adecuada', () => {
    expect(formatearTamano(512)).toBe('512 B');
    expect(formatearTamano(2048)).toBe('2 KB');
    expect(formatearTamano(1352485)).toBe('1.29 MB');
  });
});

describe('construirComparacion', () => {
  it('marca iguales los campos que coinciden', () => {
    const filas = construirComparacion(grupo.gastos, catalogos);
    const detalle = filas.find((fila) => fila.etiqueta === 'Detalle');

    expect(detalle?.iguales).toBe(true);
    expect(filas.find((fila) => fila.etiqueta === 'Empresa')?.valores).toEqual(['SODIMAC', 'SODIMAC']);
  });

  it('trata la fecha de carga como metadato aunque difiera', () => {
    const filas = construirComparacion(grupo.gastos, catalogos);
    const cargadoEl = filas.find((fila) => fila.etiqueta === 'Cargado el');

    expect(cargadoEl?.iguales).toBe(false);
    expect(cargadoEl?.metadato).toBe(true);
    expect(filas.filter((fila) => !fila.iguales && !fila.metadato)).toHaveLength(0);
  });

  it('detecta un campo del gasto que difiere', () => {
    const filas = construirComparacion(
      [grupo.gastos[0], { ...grupo.gastos[1], detalle: 'OTRO DETALLE' }],
      catalogos,
    );

    expect(filas.find((fila) => fila.etiqueta === 'Detalle')?.iguales).toBe(false);
  });
});

describe('GastosDuplicados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(postgresApi.getBootstrap).mockResolvedValue(bootstrap as never);
    vi.mocked(postgresApi.getGastosDuplicados).mockResolvedValue([grupo]);
    vi.mocked(postgresApi.setDescarteDuplicado).mockResolvedValue({ firma: grupo.firma, descartado: true });
    vi.mocked(postgresApi.deleteGasto).mockResolvedValue(undefined);
  });

  it('lista los grupos y los marca como identicos cuando solo difiere la carga', async () => {
    renderPagina();

    await screen.findByText('SODIMAC');
    expect(screen.getByRole('button', { name: /pendientes \(1\)/i })).toBeInTheDocument();
    expect(screen.getByText('Identicos')).toBeInTheDocument();
  });

  it('elimina solo las copias no conservadas', async () => {
    renderPagina();

    fireEvent.click(await screen.findByText('SODIMAC'));
    fireEvent.click(screen.getByRole('button', { name: /conservar el elegido y eliminar 1/i }));
    fireEvent.click(screen.getByRole('button', { name: 'confirmar-eliminacion' }));

    await waitFor(() => expect(postgresApi.deleteGasto).toHaveBeenCalledTimes(1));
    expect(postgresApi.deleteGasto).toHaveBeenCalledWith('gasto-2');
  });

  it('respeta el registro elegido al eliminar', async () => {
    renderPagina();

    fireEvent.click(await screen.findByText('SODIMAC'));
    fireEvent.click(screen.getAllByLabelText('Conservar este')[1]);
    fireEvent.click(screen.getByRole('button', { name: /conservar el elegido y eliminar 1/i }));
    fireEvent.click(screen.getByRole('button', { name: 'confirmar-eliminacion' }));

    await waitFor(() => expect(postgresApi.deleteGasto).toHaveBeenCalledTimes(1));
    expect(postgresApi.deleteGasto).toHaveBeenCalledWith('gasto-1');
  });

  it('marca el grupo como gastos diferentes con todos sus ids', async () => {
    renderPagina();

    fireEvent.click(await screen.findByText('SODIMAC'));
    fireEvent.click(screen.getByRole('button', { name: /son gastos diferentes/i }));

    await waitFor(() =>
      expect(postgresApi.setDescarteDuplicado).toHaveBeenCalledWith(['gasto-1', 'gasto-2'], true),
    );
    expect(postgresApi.deleteGasto).not.toHaveBeenCalled();
  });

  it('permite devolver un grupo descartado a revision', async () => {
    vi.mocked(postgresApi.getGastosDuplicados).mockResolvedValue([
      { ...grupo, descartado: true, descartadoEn: '2026-11-01T10:00:00Z', descartadoPorNombre: 'Tester' },
    ]);
    renderPagina();

    fireEvent.click(await screen.findByRole('button', { name: /marcados como diferentes \(1\)/i }));
    fireEvent.click(screen.getByText('SODIMAC'));
    fireEvent.click(screen.getByRole('button', { name: /volver a tratar como duplicado/i }));

    await waitFor(() =>
      expect(postgresApi.setDescarteDuplicado).toHaveBeenCalledWith(['gasto-1', 'gasto-2'], false),
    );
  });
});
