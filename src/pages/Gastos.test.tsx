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
});
