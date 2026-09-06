import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GastosPorPagar from './GastosPorPagar';
import { postgresApi } from '@/services/postgresApi';

vi.mock('@/hooks/useAppAuth', () => ({
  useAppAuth: () => ({
    session: {
      role: 'admin',
      user: { id: 'user-1', nombre: 'Tester', email: 'tester@rekosol.cl' },
    },
  }),
}));

vi.mock('@/components/AppSessionMenu', () => ({
  AppSessionMenu: () => <div />,
}));

vi.mock('@/components/DocumentoViewer', () => ({
  DocumentoViewer: () => <div />,
}));

vi.mock('@/components/GastoModal', () => ({
  GastoModal: ({ open, mode }: { open: boolean; mode?: string }) =>
    open ? <div data-testid="gasto-modal">{mode}</div> : null,
}));

vi.mock('@/services/postgresApi', async () => {
  return {
    postgresApi: {
      getBootstrap: vi.fn(),
      getGastosPorPagar: vi.fn(),
      createGastoPorPagar: vi.fn(),
      updateGastoPorPagar: vi.fn(),
      marcarGastoPorPagarPagado: vi.fn(),
      deleteGasto: vi.fn(),
      createProyecto: vi.fn(),
      createEmpresa: vi.fn(),
      createCategoria: vi.fn(),
    },
  };
});

const bootstrap = {
  tenant: { id: 'tenant-1', slug: 'rekosol', nombre: 'Rekosol' },
  empresas: [
    { id: 'empresa-1', razonSocial: 'Proveedor Uno SPA', rut: '76.123.456-7', createdAt: '2026-01-01' },
  ],
  proyectos: [{ id: 'proyecto-1', nombre: 'Proyecto Uno', createdAt: '2026-01-01' }],
  categorias: [{ id: 'categoria-1', nombre: 'Materiales' }],
  tiposDocumento: [
    { id: 'tipo-1', nombre: 'Factura', tieneImpuestos: true, valorImpuestos: 0.19 },
  ],
  colaboradores: [],
};

const gastoPendiente = {
  id: 'gasto-1',
  fecha: '2026-09-01',
  empresaId: 'empresa-1',
  categoria: 'categoria-1',
  tipoDocumento: 'tipo-1',
  numeroDocumento: 'F-100',
  monto: 100000,
  montoTotal: 100000,
  origen: 'COMPROMISO' as const,
  fechaCompromiso: '2026-09-01',
  fechaPago: '2026-10-15',
  facturado: true,
  pagado: false,
  creadoPorNombre: 'Tester',
  createdAt: '2026-09-01T10:00:00Z',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/gastos/por-pagar']}>
      <GastosPorPagar />
    </MemoryRouter>,
  );
}

describe('GastosPorPagar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(postgresApi.getBootstrap).mockResolvedValue(bootstrap);
    vi.mocked(postgresApi.getGastosPorPagar).mockResolvedValue([gastoPendiente]);
  });

  it('lists pending gastos with compromiso data', async () => {
    renderPage();

    await screen.findByText('Proveedor Uno SPA');
    expect(postgresApi.getGastosPorPagar).toHaveBeenCalledTimes(1);
    expect(screen.getByText('FACTURADO')).toBeInTheDocument();
    expect(screen.getByText('1 gastos por pagar encontrados')).toBeInTheDocument();
  });

  it('marks a gasto as pagado and removes it from the list', async () => {
    vi.mocked(postgresApi.marcarGastoPorPagarPagado).mockResolvedValue({
      ...gastoPendiente,
      pagado: true,
      fechaPago: '2026-09-05',
    });

    renderPage();
    await screen.findByText('Proveedor Uno SPA');

    fireEvent.click(screen.getByTitle('Marcar pagado'));

    await waitFor(() => expect(postgresApi.marcarGastoPorPagarPagado).toHaveBeenCalledTimes(1));
    expect(postgresApi.marcarGastoPorPagarPagado).toHaveBeenCalledWith(
      'gasto-1',
      expect.objectContaining({ fechaPago: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    );
    await waitFor(() => {
      expect(screen.queryByText('Proveedor Uno SPA')).not.toBeInTheDocument();
    });
  });

  it('asks invoice confirmation before paying a gasto without factura', async () => {
    vi.mocked(postgresApi.getGastosPorPagar).mockResolvedValue([
      { ...gastoPendiente, facturado: false },
    ]);
    vi.mocked(postgresApi.marcarGastoPorPagarPagado).mockResolvedValue({
      ...gastoPendiente,
      facturado: true,
      pagado: true,
      fechaPago: '2026-09-05',
    });

    renderPage();
    await screen.findByText('Proveedor Uno SPA');

    fireEvent.click(screen.getByTitle('Marcar pagado'));

    await screen.findByText('Confirmar estado de facturacion');
    expect(postgresApi.marcarGastoPorPagarPagado).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Si, fue facturado' }));

    await waitFor(() => expect(postgresApi.marcarGastoPorPagarPagado).toHaveBeenCalledTimes(1));
    expect(postgresApi.marcarGastoPorPagarPagado).toHaveBeenCalledWith(
      'gasto-1',
      expect.objectContaining({ facturado: true }),
    );
  });

  it('opens the modal in compromiso mode', async () => {
    renderPage();
    await screen.findByText('Proveedor Uno SPA');

    fireEvent.click(screen.getByRole('button', { name: /nuevo pago pendiente/i }));

    expect(screen.getByTestId('gasto-modal')).toHaveTextContent('compromiso');
  });

  it('ordena por vencimiento (fechaPago) y no por la fecha del documento', async () => {
    // El orden por fecha de documento seria el inverso: 'tarde' es de agosto y
    // 'pronto' de septiembre. Manda fechaPago.
    vi.mocked(postgresApi.getGastosPorPagar).mockResolvedValue([
      { ...gastoPendiente, id: 'tarde', numeroDocumento: 'F-TARDE', fechaCompromiso: '2026-08-01', fechaPago: '2026-12-20' },
      { ...gastoPendiente, id: 'pronto', numeroDocumento: 'F-PRONTO', fechaCompromiso: '2026-09-15', fechaPago: '2026-09-20' },
    ]);

    renderPage();
    await screen.findByText(/F-PRONTO/);

    const filas = screen.getAllByRole('row').slice(1);
    expect(filas[0]).toHaveTextContent('F-PRONTO');
    expect(filas[1]).toHaveTextContent('F-TARDE');
  });

  it('muestra la fecha de pago sin correrla un dia', async () => {
    renderPage();
    await screen.findByText('Proveedor Uno SPA');

    // fechaPago '2026-10-15' debe verse tal cual, no como 14/10/2026.
    expect(screen.getByText('15/10/2026')).toBeInTheDocument();
    expect(screen.getByText('01/09/2026')).toBeInTheDocument();
  });
});
