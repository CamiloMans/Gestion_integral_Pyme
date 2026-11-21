import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Gastos from './Gastos';
import { postgresApi } from '@/services/postgresApi';
import { downloadGastosExcel } from '@/lib/gastos-excel';

vi.mock('@/hooks/useAppAuth', () => ({
  useAppAuth: () => ({
    session: {
      role: 'admin',
      permissions: ['expenses.records', 'expenses.bulk_upload'],
      user: { id: 'user-1', nombre: 'Tester', email: 'tester@rekosol.cl' },
    },
  }),
}));

vi.mock('@/components/AppSessionMenu', () => ({ AppSessionMenu: () => <div /> }));
vi.mock('@/components/DocumentoViewer', () => ({ DocumentoViewer: () => <div /> }));
vi.mock('@/components/DetalleGastoDialog', () => ({ DetalleGastoDialog: () => <div /> }));
vi.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => <div /> }));
vi.mock('@/components/GastoModal', () => ({ GastoModal: () => <div /> }));
vi.mock('@/lib/gastos-excel', () => ({ downloadGastosExcel: vi.fn() }));

vi.mock('@/services/postgresApi', () => ({
  postgresApi: {
    getBootstrap: vi.fn(), getGastos: vi.fn(), createGasto: vi.fn(), updateGasto: vi.fn(), deleteGasto: vi.fn(),
    createProyecto: vi.fn(), createCategoria: vi.fn(), createEmpresa: vi.fn(),
  },
}));

const bootstrap = {
  tenant: { id: 'tenant-1', slug: 'rekosol', nombre: 'Rekosol' },
  empresas: [{ id: 'empresa-1', razonSocial: 'Proveedor Uno SPA', rut: '76.123.456-7', createdAt: '2026-01-01' }],
  proyectos: [{ id: 'proyecto-1', nombre: 'Proyecto Uno', createdAt: '2026-01-01' }],
  categorias: [{ id: 'categoria-1', nombre: 'Materiales', color: 'bg-blue-500' }],
  tiposDocumento: [{ id: 'tipo-1', nombre: 'Factura', tieneImpuestos: true, valorImpuestos: 0.19 }],
  colaboradores: [],
};

const gastos = [
  { id: 'gasto-1', fecha: '2026-09-17', empresaId: 'empresa-1', proyectoId: 'proyecto-1', categoria: 'categoria-1', tipoDocumento: 'tipo-1', numeroDocumento: 'F-1', monto: 1000, createdAt: '2026-09-17T10:00:00Z' },
  { id: 'gasto-2', fecha: '2026-09-16', empresaId: 'empresa-1', categoria: 'categoria-1', tipoDocumento: 'tipo-1', numeroDocumento: 'F-2', monto: 2000, createdAt: '2026-09-16T10:00:00Z' },
];

const bootstrapOrdenable = {
  ...bootstrap,
  proyectos: [
    { id: 'proyecto-1', nombre: 'Proyecto Zeta', createdAt: '2026-01-01' },
    { id: 'proyecto-2', nombre: 'Proyecto Alfa', createdAt: '2026-01-01' },
  ],
};

const gastosOrdenables = [
  { id: 'gasto-antiguo', fecha: '2026-09-10', empresaId: 'empresa-1', proyectoId: 'proyecto-1', categoria: 'categoria-1', tipoDocumento: 'tipo-1', numeroDocumento: 'F-20', monto: 2000, montoTotal: 2000, createdAt: '2026-09-10T10:00:00Z' },
  { id: 'gasto-reciente', fecha: '2026-09-20', empresaId: 'empresa-1', proyectoId: 'proyecto-2', categoria: 'categoria-1', tipoDocumento: 'tipo-1', numeroDocumento: 'F-3', monto: 300, montoTotal: 300, createdAt: '2026-09-20T10:00:00Z' },
];

const rowTexts = () => screen.getAllByRole('row').slice(1).map((row) => row.textContent || '');

describe('Gastos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(postgresApi.getBootstrap).mockResolvedValue(bootstrap);
    vi.mocked(postgresApi.getGastos).mockResolvedValue(gastos);
    vi.mocked(downloadGastosExcel).mockResolvedValue(2);
  });

  it('exporta todos los gastos cargados aunque la vista esté filtrada', async () => {
    render(<MemoryRouter initialEntries={['/gastos']}><Gastos /></MemoryRouter>);

    await screen.findAllByText('Proveedor Uno SPA');
    fireEvent.change(screen.getByPlaceholderText('Buscar gasto...'), { target: { value: 'F-1' } });
    expect(screen.getByText('1 gastos encontrados')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /exportar excel/i }));

    await waitFor(() => expect(downloadGastosExcel).toHaveBeenCalledWith(gastos, bootstrap));
  });

  it('ordena por fecha inicial, texto, numero y alterna direccion al repetir encabezado', async () => {
    vi.mocked(postgresApi.getBootstrap).mockResolvedValue(bootstrapOrdenable);
    vi.mocked(postgresApi.getGastos).mockResolvedValue(gastosOrdenables);
    render(<MemoryRouter initialEntries={['/gastos']}><Gastos /></MemoryRouter>);

    await screen.findByText('Proyecto Alfa');
    expect(rowTexts()[0]).toContain('#F-3');

    fireEvent.click(screen.getByRole('button', { name: /ordenar por creado ascendente/i }));
    expect(rowTexts()[0]).toContain('#F-20');

    fireEvent.click(screen.getByRole('button', { name: /ordenar por proyecto ascendente/i }));
    expect(rowTexts()[0]).toContain('Proyecto Alfa');

    fireEvent.click(screen.getByRole('button', { name: /ordenar por monto total ascendente/i }));
    expect(rowTexts()[0]).toContain('#F-3');
    fireEvent.click(screen.getByRole('button', { name: /ordenar por monto total descendente/i }));
    expect(rowTexts()[0]).toContain('#F-20');
  });

  it('ordena todo el resultado antes de aplicar paginacion', async () => {
    const gastosPaginados = Array.from({ length: 51 }, (_, index) => ({
      id: `gasto-${index + 1}`,
      fecha: '2026-09-01',
      empresaId: 'empresa-1',
      categoria: 'categoria-1',
      tipoDocumento: 'tipo-1',
      numeroDocumento: `N-${index + 1}`,
      monto: index + 1,
      createdAt: `2026-09-01T${String(index % 24).padStart(2, '0')}:00:00Z`,
    }));
    vi.mocked(postgresApi.getGastos).mockResolvedValue(gastosPaginados);
    render(<MemoryRouter initialEntries={['/gastos']}><Gastos /></MemoryRouter>);

    await screen.findByText('51 gastos encontrados');
    fireEvent.click(screen.getByRole('button', { name: /ordenar por documento ascendente/i }));
    fireEvent.click(screen.getByRole('button', { name: /ordenar por documento descendente/i }));

    expect(rowTexts()[0]).toContain('#N-51');
  });

  it('muestra la fecha del gasto sin correr el dia', async () => {
    // Regresion: la lista mostraba 28-10-2026 para un gasto guardado el 2026-10-29.
    vi.mocked(postgresApi.getGastos).mockResolvedValue([
      // createdAt en otro dia: '29-10-2026' solo puede venir de `fecha`.
      { id: 'gasto-bryancar', fecha: '2026-10-29', empresaId: 'empresa-1', categoria: 'categoria-1', tipoDocumento: 'tipo-1', numeroDocumento: 'F-440300', monto: 440300, montoTotal: 440300, createdAt: '2026-11-03T21:17:36.394Z' },
    ]);
    render(<MemoryRouter initialEntries={['/gastos']}><Gastos /></MemoryRouter>);

    await screen.findByText('1 gastos encontrados');
    expect(rowTexts()[0]).toContain('29-10-2026');
    expect(rowTexts()[0]).not.toContain('28-10-2026');
  });
});
