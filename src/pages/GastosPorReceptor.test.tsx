import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GastosPorReceptor from './GastosPorReceptor';
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
vi.mock('@/components/DocumentoViewer', () => ({ DocumentoViewer: () => <div /> }));

vi.mock('@/components/DetalleGastoDialog', () => ({
  DetalleGastoDialog: ({ open, gasto }: { open: boolean; gasto?: Gasto }) =>
    open ? <div>detalle de {gasto?.numeroDocumento}</div> : null,
}));

vi.mock('@/services/postgresApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/postgresApi')>();

  return {
    ...actual,
    postgresApi: {
      getBootstrap: vi.fn(),
      getGastos: vi.fn(),
      getGastosPorPagar: vi.fn(),
    },
  };
});

const bootstrap = {
  tenant: { id: 'tenant-1', slug: 'rekosol', nombre: 'Rekosol' },
  empresas: [
    { id: 'sodimac', razonSocial: 'SODIMAC', rut: '96.792.430-K', categoria: 'Empresa', createdAt: '2026-01-01' },
    { id: 'jose', razonSocial: 'JOSE RUIZ', rut: '4689468-5', categoria: 'Persona Natural', createdAt: '2026-01-01' },
  ],
  proyectos: [
    { id: 'coyhaique', nombre: 'CON-PR20-COYHAIQUE', codigoProyecto: 'PR20', createdAt: '2026-01-01' },
    { id: 'castro', nombre: 'CON-PR21-CASTRO', codigoProyecto: 'PR21', createdAt: '2026-01-01' },
  ],
  categorias: [
    { id: 'materiales', nombre: 'MATERIALES', color: 'bg-blue-500' },
    { id: 'fletes', nombre: 'FLETES', color: 'bg-green-500' },
  ],
  tiposDocumento: [{ id: 'factura', nombre: 'FACTURA', tieneImpuestos: true, valorImpuestos: 0.19 }],
  colaboradores: [],
};

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

const pagados = [
  gasto({ id: '1', numeroDocumento: '150554944', montoTotal: 39364, colaboradorNombre: 'Camilo', creadoPorNombre: 'Gerardo Soto' }),
  gasto({ id: '2', numeroDocumento: 'F-900', montoTotal: 500000, proyectoId: 'castro', categoria: 'fletes' }),
  gasto({ id: '3', empresaId: 'jose', numeroDocumento: 'B-1', montoTotal: 29700 }),
];

const pendientes = [
  gasto({ id: '4', empresaId: 'jose', numeroDocumento: 'B-2', montoTotal: 120000, origen: 'COMPROMISO', pagado: false }),
];

const renderPagina = async () => {
  render(<MemoryRouter initialEntries={['/gastos/por-receptor']}><GastosPorReceptor /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('SODIMAC')).toBeInTheDocument());
};

const tarjetaTotales = () => screen.getByLabelText('Totales del resultado filtrado');

describe('GastosPorReceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(postgresApi.getBootstrap).mockResolvedValue(bootstrap as never);
    vi.mocked(postgresApi.getGastos).mockResolvedValue(pagados);
    vi.mocked(postgresApi.getGastosPorPagar).mockResolvedValue(pendientes);
  });

  it('agrupa por receptor y separa lo pagado de lo pendiente', async () => {
    await renderPagina();

    const totales = tarjetaTotales();
    expect(within(totales).getByText('2')).toBeInTheDocument();
    expect(within(totales).getByText('$569.064')).toBeInTheDocument();
    expect(within(totales).getByText('$120.000')).toBeInTheDocument();
  });

  it('muestra la categoria del receptor junto al nombre', async () => {
    await renderPagina();

    expect(screen.getByText('Empresa')).toBeInTheDocument();
    expect(screen.getByText('Persona Natural')).toBeInTheDocument();
  });

  it('al abrir un receptor muestra la distribucion por proyecto y por categoria', async () => {
    await renderPagina();

    fireEvent.click(screen.getByText('SODIMAC'));

    const porProyecto = within(await screen.findByLabelText('Distribucion por proyecto'));
    expect(porProyecto.getByText('CON-PR20-COYHAIQUE')).toBeInTheDocument();
    expect(porProyecto.getByText('CON-PR21-CASTRO')).toBeInTheDocument();

    const porCategoria = within(screen.getByLabelText('Distribucion por categoria'));
    expect(porCategoria.getByText('MATERIALES')).toBeInTheDocument();
    expect(porCategoria.getByText('FLETES')).toBeInTheDocument();
  });

  it('distingue a quien rinde de quien registra el gasto', async () => {
    await renderPagina();

    fireEvent.click(screen.getByText('SODIMAC'));

    expect(await screen.findByText('Camilo')).toBeInTheDocument();
    expect(screen.getByText('Gerardo Soto')).toBeInTheDocument();
  });

  it('marca el movimiento comprometido como pendiente', async () => {
    await renderPagina();

    fireEvent.click(screen.getByText('JOSE RUIZ'));

    const movimientos = within(await screen.findByLabelText('Movimientos del receptor'));
    expect(movimientos.getByText('Pendiente')).toBeInTheDocument();
    expect(movimientos.getByText('B-2')).toBeInTheDocument();
  });

  it('abre el detalle del movimiento con sus respaldos', async () => {
    await renderPagina();

    fireEvent.click(screen.getByText('SODIMAC'));
    fireEvent.click(await screen.findByText('150554944'));

    expect(await screen.findByText('detalle de 150554944')).toBeInTheDocument();
  });

  it('filtra por nombre', async () => {
    await renderPagina();

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'jose' } });

    await waitFor(() => expect(screen.queryByText('SODIMAC')).not.toBeInTheDocument());
    expect(screen.getByText('JOSE RUIZ')).toBeInTheDocument();
  });

  it('filtra por RUT escrito con puntos y guion', async () => {
    await renderPagina();

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: '4.689.468-5' } });

    await waitFor(() => expect(screen.queryByText('SODIMAC')).not.toBeInTheDocument());
    expect(screen.getByText('JOSE RUIZ')).toBeInTheDocument();
  });

  it('avisa cuando ningun receptor coincide', async () => {
    await renderPagina();

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'nadie' } });

    expect(await screen.findByText('Ningun receptor coincide con el filtro.')).toBeInTheDocument();
  });

  it('muestra el error y permite reintentar', async () => {
    vi.mocked(postgresApi.getGastos).mockRejectedValueOnce(new Error('Sin conexion'));
    render(<MemoryRouter initialEntries={['/gastos/por-receptor']}><GastosPorReceptor /></MemoryRouter>);

    expect(await screen.findByText('Sin conexion')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('SODIMAC')).toBeInTheDocument();
  });
});

describe('GastosPorReceptor: lista por tramos', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const muchos = Array.from({ length: 60 }, (_, indice) => ({
      id: `empresa-${indice}`,
      razonSocial: `RECEPTOR ${String(indice).padStart(2, '0')}`,
      rut: '',
      categoria: 'Empresa' as const,
      createdAt: '2026-01-01',
    }));

    vi.mocked(postgresApi.getBootstrap).mockResolvedValue({
      ...bootstrap,
      empresas: muchos,
    } as never);
    vi.mocked(postgresApi.getGastos).mockResolvedValue(
      muchos.map((empresa, indice) =>
        gasto({ id: `g-${indice}`, empresaId: empresa.id, montoTotal: 1000 * (60 - indice) }),
      ),
    );
    vi.mocked(postgresApi.getGastosPorPagar).mockResolvedValue([]);
  });

  it('muestra los primeros 50 y ofrece el resto', async () => {
    render(<MemoryRouter initialEntries={['/gastos/por-receptor']}><GastosPorReceptor /></MemoryRouter>);

    expect(await screen.findByText('RECEPTOR 00')).toBeInTheDocument();
    expect(screen.getByText('RECEPTOR 49')).toBeInTheDocument();
    expect(screen.queryByText('RECEPTOR 50')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Mostrar mas receptores \(10 restantes\)/ }));

    expect(await screen.findByText('RECEPTOR 59')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mostrar mas receptores/ })).not.toBeInTheDocument();
  }, 20000);

  it('vuelve al primer tramo al cambiar la busqueda', async () => {
    render(<MemoryRouter initialEntries={['/gastos/por-receptor']}><GastosPorReceptor /></MemoryRouter>);
    expect(await screen.findByText('RECEPTOR 00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Mostrar mas receptores/ }));
    expect(await screen.findByText('RECEPTOR 59')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'RECEPTOR' } });

    await waitFor(() => expect(screen.queryByText('RECEPTOR 59')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Mostrar mas receptores \(10 restantes\)/ })).toBeInTheDocument();
  }, 20000);
});
