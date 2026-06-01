import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GastosCargaMasiva from './GastosCargaMasiva';
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

vi.mock('@/services/postgresApi', async () => {
  return {
    postgresApi: {
      getBootstrap: vi.fn(),
      extractGastoDocument: vi.fn(),
      createGasto: vi.fn(),
    },
  };
});

const bootstrap = {
  tenant: { id: 'tenant-1', slug: 'rekosol', nombre: 'Rekosol' },
  empresas: [
    { id: 'empresa-1', razonSocial: 'Proveedor Uno SPA', rut: '76.123.456-7', createdAt: '2026-01-01' },
    { id: 'empresa-sergio', razonSocial: 'SERGIO MUÑOZ AROS', rut: '28669789-5', createdAt: '2026-01-01' },
  ],
  proyectos: [{ id: 'proyecto-1', nombre: 'Proyecto Uno', createdAt: '2026-01-01' }],
  categorias: [{ id: 'categoria-1', nombre: 'Materiales' }],
  tiposDocumento: [
    { id: 'tipo-1', nombre: 'Factura', tieneImpuestos: true, valorImpuestos: 0.19 },
    { id: 'tipo-otro', nombre: 'OTRO', tieneImpuestos: false, valorImpuestos: 0 },
  ],
  colaboradores: [],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/gastos/carga-masiva']}>
      <GastosCargaMasiva />
    </MemoryRouter>,
  );
}

describe('GastosCargaMasiva', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `row-${Math.random()}`) });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    });
    vi.mocked(postgresApi.getBootstrap).mockResolvedValue(bootstrap);
  });

  it('creates rows and keeps extraction errors isolated', async () => {
    vi.mocked(postgresApi.extractGastoDocument)
      .mockResolvedValueOnce({
        fecha: '2026-05-30',
        tipoDocumento: 'FACTURA',
        numeroDocumento: '123',
        empresaNombre: 'PROVEEDOR UNO SPA',
        empresaRut: '76.123.456-7',
        emisorNombre: null,
        emisorRut: null,
        receptorNombre: null,
        receptorRut: null,
        montoNeto: 840,
        iva: 160,
        montoTotal: 1000,
        detalle: 'Compra materiales',
        confidence: 0.91,
        warnings: [],
      })
      .mockRejectedValueOnce(new Error('OCR fallido'));

    const { container } = renderPage();
    await screen.findByText('Seleccionar documentos');

    const input = container.querySelector('#bulk-gasto-files') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          new File(['a'], 'ok.pdf', { type: 'application/pdf' }),
          new File(['b'], 'fail.pdf', { type: 'application/pdf' }),
        ],
      },
    });

    await waitFor(() => expect(screen.getByText('ok.pdf')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('OCR fallido')).toBeInTheDocument());
    expect(postgresApi.extractGastoDocument).toHaveBeenCalledTimes(2);
  });

  it('saves only validated rows', async () => {
    vi.mocked(postgresApi.extractGastoDocument).mockResolvedValue({
      fecha: '2026-05-30',
      tipoDocumento: 'FACTURA',
      numeroDocumento: '123',
      empresaNombre: 'PROVEEDOR UNO SPA',
      empresaRut: '76.123.456-7',
      emisorNombre: null,
      emisorRut: null,
      receptorNombre: null,
      receptorRut: null,
      montoNeto: 840,
      iva: 160,
      montoTotal: 1000,
      detalle: 'Compra materiales',
      confidence: 0.91,
      warnings: [],
    });
    vi.mocked(postgresApi.createGasto).mockResolvedValue({
      id: 'gasto-1',
      fecha: '2026-05-30',
      categoria: 'categoria-1',
      empresaId: 'empresa-1',
      tipoDocumento: 'tipo-1',
      numeroDocumento: '123',
      monto: 1000,
      montoTotal: 1000,
    });

    const { container } = renderPage();
    await screen.findByText('Seleccionar documentos');

    const input = container.querySelector('#bulk-gasto-files') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['a'], 'ok.pdf', { type: 'application/pdf' })] },
    });

    await waitFor(() => expect(screen.getByText(/Conf\. 91%/)).toBeInTheDocument());

    const selects = container.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: 'categoria-1' } });
    fireEvent.click(screen.getByText(/Aplicar a/));

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getAllByText('Guardar validados')[1]);

    await waitFor(() => expect(postgresApi.createGasto).toHaveBeenCalledTimes(1));
    expect(vi.mocked(postgresApi.createGasto).mock.calls[0][0]).toMatchObject({
      categoria: 'categoria-1',
      empresaId: 'empresa-1',
      tipoDocumento: 'tipo-1',
      numeroDocumento: '123',
      montoTotal: 1000,
    });
  });

  it('uses the same company matching confidence as single upload', async () => {
    vi.mocked(postgresApi.extractGastoDocument).mockResolvedValue({
      fecha: '2026-05-29',
      tipoDocumento: 'OTRO',
      numeroDocumento: 'INT_EMP2605281617124678197520',
      empresaNombre: 'SERGIO HERNAN MUNOZ ARCOS',
      empresaRut: '028669789-5',
      emisorNombre: 'BANCO DE CHILE',
      emisorRut: null,
      receptorNombre: 'REKOSOL INGENIERIA SPA',
      receptorRut: '77522275-1',
      montoNeto: null,
      iva: null,
      montoTotal: 801740,
      detalle: 'Traspaso bancario a Sergio Hernan Munoz Arcos',
      confidence: 0.95,
      warnings: [],
    });

    const { container } = renderPage();
    await screen.findByText('Seleccionar documentos');

    const input = container.querySelector('#bulk-gasto-files') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['a'], 'ComprobanteMov.pdf', { type: 'application/pdf' })] },
    });

    await waitFor(() => expect(screen.getByText(/Empresa 100% por rut: SERGIO MUÑOZ AROS/)).toBeInTheDocument());
    expect(screen.getByPlaceholderText('Ej: NOTA DE CREDITO, RECIBO, ETC.')).toBeInTheDocument();
    expect(screen.getByText(/Especificar tipo de documento/)).toBeInTheDocument();

    await waitFor(() => {
      const selects = Array.from(container.querySelectorAll('select')) as HTMLSelectElement[];
      expect(selects.some((select) => select.value === 'empresa-sergio')).toBe(true);
    });
  });
});
