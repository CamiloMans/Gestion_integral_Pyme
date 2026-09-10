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
      createEmpresa: vi.fn(),
    },
  };
});

const bootstrap = {
  tenant: { id: 'tenant-1', slug: 'rekosol', nombre: 'Rekosol' },
  empresas: [
    { id: 'empresa-1', razonSocial: 'Proveedor Uno SPA', rut: '76.123.456-7', createdAt: '2026-01-01' },
    { id: 'empresa-sergio', razonSocial: 'SERGIO MUÑOZ AROS', rut: '28669789-5', createdAt: '2026-01-01' },
    { id: 'empresa-franklin', razonSocial: 'FRANKLIN SOTO GUICHAPANI', rut: '19.146.703-5', createdAt: '2026-01-01' },
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

function bankOperation(indice: number, overrides: Record<string, unknown> = {}) {
  return {
    indice,
    fecha: '2026-09-07',
    numeroDocumento: null,
    numeroOperacion: null,
    idTransaccion: null,
    beneficiarioNombre: null,
    beneficiarioRut: null,
    bancoDestino: 'BANCO DEL ESTADO DE CHILE',
    cuentaDestino: null,
    cuentaOrigen: '001015259301',
    monto: null,
    tipoOperacion: 'TRANSFERENCIA',
    detalle: null,
    ...overrides,
  };
}

function comprobanteExtraction(operacionesBancarias: ReturnType<typeof bankOperation>[], overrides = {}) {
  return {
    fecha: '2026-09-07',
    tipoDocumento: 'OTRO' as const,
    numeroDocumento: null,
    empresaNombre: null,
    empresaRut: null,
    emisorNombre: 'BANCO DE CHILE',
    emisorRut: null,
    receptorNombre: 'REKOSOL INGENIERIA SPA',
    receptorRut: '77522275-1',
    montoNeto: null,
    iva: null,
    montoTotal: 651836,
    detalle: 'COMPROBANTE DE OPERACIONES AUTORIZADAS',
    confidence: 0.95,
    warnings: [],
    esComprobanteBancario: true,
    operacionesDeclaradas: operacionesBancarias.length,
    operacionesBancarias,
    ...overrides,
  };
}

const CUATRO_TRANSFERENCIAS = [
  bankOperation(1, {
    numeroDocumento: '6033950421',
    numeroOperacion: '6033950421',
    beneficiarioNombre: 'TERMOALUMPLAS S.P.A',
    beneficiarioRut: '77079176-6',
    cuentaDestino: '083170458403',
    monto: 190000,
    detalle: 'TRANSFERENCIA A TERMOALUMPLAS S.P.A',
  }),
  bankOperation(2, {
    numeroDocumento: '6033950205',
    numeroOperacion: '6033950205',
    beneficiarioNombre: 'SERGIO HERNAN MUNOZ ARCOS',
    beneficiarioRut: '28669789-5',
    cuentaDestino: '000028669789',
    monto: 24015,
    detalle: 'TRANSFERENCIA A SERGIO HERNAN MUNOZ ARCOS',
  }),
  bankOperation(3, {
    numeroDocumento: '6033949908',
    numeroOperacion: '6033949908',
    beneficiarioNombre: 'MAURICIO SOTO BARAHONA',
    beneficiarioRut: '12465535-8',
    bancoDestino: 'BCI MACHBANK',
    cuentaDestino: '000063045672',
    monto: 421821,
    detalle: 'TRANSFERENCIA A MAURICIO SOTO BARAHONA',
  }),
  bankOperation(4, {
    numeroDocumento: '6033950047',
    numeroOperacion: '6033950047',
    beneficiarioNombre: 'SERGIO HERNAN MUNOZ ARCOS',
    beneficiarioRut: '28669789-5',
    cuentaDestino: '000028669789',
    monto: 16000,
    detalle: 'TRANSFERENCIA A SERGIO HERNAN MUNOZ ARCOS',
  }),
];

const FACTURA_EXTRACCION = {
  fecha: '2026-05-30',
  tipoDocumento: 'FACTURA' as const,
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
};

function uploadFiles(container: HTMLElement, files: File[]) {
  const input = container.querySelector('#bulk-gasto-files') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
}

/** Fija Categoria y Proyecto en la barra superior: no se extraen nunca del documento. */
function applyCategoriaYProyecto(container: HTMLElement) {
  const selects = container.querySelectorAll('select');
  fireEvent.change(selects[0], { target: { value: 'categoria-1' } });
  fireEvent.change(selects[2], { target: { value: 'proyecto-1' } });
  fireEvent.click(screen.getByText(/Aplicar a/));
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

  it('creates a supplier from the bulk company selector and selects it', async () => {
    vi.mocked(postgresApi.createEmpresa).mockResolvedValue({
      id: 'empresa-new',
      razonSocial: 'PROVEEDOR NUEVO SPA',
      rut: '76123456-8',
      createdAt: '2026-08-16',
    });

    const { container } = renderPage();
    await screen.findByText('Seleccionar documentos');

    fireEvent.click(screen.getByRole('button', { name: 'Agregar empresa' }));
    fireEvent.change(screen.getByLabelText('Nombre Empresa *'), { target: { value: 'Proveedor Nuevo SPA' } });
    fireEvent.change(screen.getByLabelText(/Rut/), { target: { value: '76123456-8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(postgresApi.createEmpresa).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((container.querySelectorAll('select')[1] as HTMLSelectElement).value).toBe('empresa-new'));
    expect(screen.getByRole('option', { name: 'PROVEEDOR NUEVO SPA' })).toBeInTheDocument();
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

    applyCategoriaYProyecto(container);

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getAllByText('Guardar validados')[1]);

    await waitFor(() => expect(postgresApi.createGasto).toHaveBeenCalledTimes(1));
    expect(vi.mocked(postgresApi.createGasto).mock.calls[0][0]).toMatchObject({
      categoria: 'categoria-1',
      empresaId: 'empresa-1',
      proyectoId: 'proyecto-1',
      tipoDocumento: 'tipo-1',
      numeroDocumento: '123',
      montoTotal: 1000,
    });
  });

  describe('comprobantes bancarios', () => {
    it('expands a consolidated voucher into one row per transfer', async () => {
      vi.mocked(postgresApi.extractGastoDocument).mockResolvedValue(comprobanteExtraction(CUATRO_TRANSFERENCIAS));

      const { container } = renderPage();
      await screen.findByText('Seleccionar documentos');

      uploadFiles(container, [new File(['a'], 'Comprobante.pdf', { type: 'application/pdf' })]);

      await waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(4));
      expect(screen.getAllByText(/Transferencia \d de 4/)).toHaveLength(4);
      expect(screen.getByText(/Transferencia 1 de 4 · TERMOALUMPLAS S\.P\.A/)).toBeInTheDocument();
      expect(screen.getByText(/BCI MACHBANK · 000063045672/)).toBeInTheDocument();

      // Cada transferencia lleva su propio monto; el total del encabezado no es una fila.
      for (const monto of ['190.000', '24.015', '421.821', '16.000']) {
        expect(screen.getByDisplayValue(monto)).toBeInTheDocument();
      }
      expect(screen.queryByDisplayValue('651.836')).not.toBeInTheDocument();

      // El mismo beneficiario aparece dos veces con numeros de operacion distintos.
      expect(screen.getByDisplayValue('6033950205')).toBeInTheDocument();
      expect(screen.getByDisplayValue('6033950047')).toBeInTheDocument();

      // Ninguna fila queda con el titular de la cuenta de origen.
      expect(screen.queryByText(/REKOSOL/)).not.toBeInTheDocument();

      // El tipo "OTRO" viene con su comentario prellenado para no tipearlo N veces.
      expect(screen.getAllByDisplayValue('TRANSFERENCIA')).toHaveLength(4);
    });

    it('keeps a single-transfer voucher as one row and matches the beneficiary by rut', async () => {
      vi.mocked(postgresApi.extractGastoDocument).mockResolvedValue(comprobanteExtraction([
        bankOperation(1, {
          numeroDocumento: 'INT_EMP2609081156125616522290',
          idTransaccion: 'INT_EMP2609081156125616522290',
          beneficiarioNombre: 'FRANKLIN SOTO GUICHAPANI',
          // El servidor conserva el cero a la izquierda que imprime el banco.
          beneficiarioRut: '019146703-5',
          cuentaDestino: '00000000083260134429',
          monto: 140000,
          detalle: 'TRANSFERENCIA A FRANKLIN SOTO GUICHAPANI',
        }),
      ], { fecha: '2026-09-08', montoTotal: 140000 }));

      const { container } = renderPage();
      await screen.findByText('Seleccionar documentos');

      uploadFiles(container, [new File(['a'], 'ComprobanteMov.pdf', { type: 'application/pdf' })]);

      await waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(1));
      expect(screen.getByText(/Transferencia · FRANKLIN SOTO GUICHAPANI/)).toBeInTheDocument();
      expect(screen.queryByText(/de 1/)).not.toBeInTheDocument();
      expect(screen.getByDisplayValue('INT_EMP2609081156125616522290')).toBeInTheDocument();
      expect(screen.getByText(/Empresa 100% por rut: FRANKLIN SOTO GUICHAPANI/)).toBeInTheDocument();
    });

    it('keeps invoices and transfers in upload order', async () => {
      vi.mocked(postgresApi.extractGastoDocument)
        .mockResolvedValueOnce(FACTURA_EXTRACCION)
        .mockResolvedValueOnce(comprobanteExtraction(CUATRO_TRANSFERENCIAS.slice(0, 2), { montoTotal: 214015 }));

      const { container } = renderPage();
      await screen.findByText('Seleccionar documentos');

      uploadFiles(container, [
        new File(['a'], 'factura.pdf', { type: 'application/pdf' }),
        new File(['b'], 'Comprobante.pdf', { type: 'application/pdf' }),
      ]);

      await waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(3));

      const rows = Array.from(container.querySelectorAll('tbody tr'));
      expect(rows[0].textContent).toContain('factura.pdf');
      expect(rows[1].textContent).toContain('Transferencia 1 de 2');
      expect(rows[2].textContent).toContain('Transferencia 2 de 2');
    });

    it('shows the mismatch warning coming from the backend', async () => {
      vi.mocked(postgresApi.extractGastoDocument).mockResolvedValue(comprobanteExtraction(
        CUATRO_TRANSFERENCIAS.slice(0, 3),
        {
          operacionesDeclaradas: 4,
          warnings: ['El comprobante declara 4 operacion(es) y se extrajeron 3. Revisa el documento completo.'],
        },
      ));

      const { container } = renderPage();
      await screen.findByText('Seleccionar documentos');

      uploadFiles(container, [new File(['a'], 'Comprobante.pdf', { type: 'application/pdf' })]);

      await waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(3));
      expect(screen.getAllByText(/declara 4 operacion\(es\) y se extrajeron 3/)).toHaveLength(3);
    });

    it('removes a single transfer row without touching the others', async () => {
      vi.mocked(postgresApi.extractGastoDocument).mockResolvedValue(comprobanteExtraction(CUATRO_TRANSFERENCIAS));

      const { container } = renderPage();
      await screen.findByText('Seleccionar documentos');

      uploadFiles(container, [new File(['a'], 'Comprobante.pdf', { type: 'application/pdf' })]);

      await waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(4));
      fireEvent.click(screen.getByRole('button', { name: 'Eliminar Comprobante.pdf transferencia 3 de 4' }));

      await waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(3));
      expect(screen.queryByDisplayValue('421.821')).not.toBeInTheDocument();
      expect(screen.getByDisplayValue('190.000')).toBeInTheDocument();
      expect(screen.getByDisplayValue('16.000')).toBeInTheDocument();
    });

    it('creates a missing beneficiary from the row with its data prefilled', async () => {
      vi.mocked(postgresApi.extractGastoDocument).mockResolvedValue(comprobanteExtraction([
        CUATRO_TRANSFERENCIAS[0],
      ], { montoTotal: 190000 }));
      vi.mocked(postgresApi.createEmpresa).mockResolvedValue({
        id: 'empresa-termo',
        razonSocial: 'TERMOALUMPLAS S.P.A',
        rut: '77079176-6',
        createdAt: '2026-09-07',
      });

      const { container } = renderPage();
      await screen.findByText('Seleccionar documentos');

      uploadFiles(container, [new File(['a'], 'Comprobante.pdf', { type: 'application/pdf' })]);

      await waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(1));
      fireEvent.click(screen.getByRole('button', { name: 'Crear empresa TERMOALUMPLAS S.P.A' }));

      // Crear, no editar: el modal llega con los datos del comprobante ya puestos.
      expect(screen.getByText('Nueva Empresa')).toBeInTheDocument();
      expect(screen.getByLabelText('Nombre Empresa *')).toHaveValue('TERMOALUMPLAS S.P.A');
      expect(screen.getByLabelText(/Rut/)).toHaveValue('77079176-6');

      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(postgresApi.createEmpresa).toHaveBeenCalledTimes(1));
      await waitFor(() => {
        const selects = Array.from(container.querySelectorAll('tbody select')) as HTMLSelectElement[];
        expect(selects.some((select) => select.value === 'empresa-termo')).toBe(true);
      });
    });

    it('saves every transfer as its own gasto with the shared file attached', async () => {
      vi.mocked(postgresApi.extractGastoDocument).mockResolvedValue(comprobanteExtraction(
        CUATRO_TRANSFERENCIAS.slice(1, 3),
        { montoTotal: 445836 },
      ));
      vi.mocked(postgresApi.createGasto).mockImplementation(async (gasto) => ({ ...gasto, id: 'gasto-nuevo' }));

      const { container } = renderPage();
      await screen.findByText('Seleccionar documentos');

      const archivo = new File(['a'], 'Comprobante.pdf', { type: 'application/pdf' });
      uploadFiles(container, [archivo]);

      await waitFor(() => expect(container.querySelectorAll('tbody tr')).toHaveLength(2));
      applyCategoriaYProyecto(container);

      // Solo la segunda fila tiene empresa conocida; la primera queda sin proveedor.
      const empresaSelects = Array.from(container.querySelectorAll('tbody select')).filter(
        (select) => Array.from((select as HTMLSelectElement).options).some((option) => option.value === 'empresa-sergio'),
      ) as HTMLSelectElement[];
      fireEvent.change(empresaSelects[1], { target: { value: 'empresa-1' } });

      for (const row of ['transferencia 1 de 2', 'transferencia 2 de 2']) {
        fireEvent.click(screen.getByRole('checkbox', { name: `Validar Comprobante.pdf ${row}` }));
      }

      fireEvent.click(screen.getAllByText('Guardar validados')[1]);

      await waitFor(() => expect(postgresApi.createGasto).toHaveBeenCalledTimes(2));

      const calls = vi.mocked(postgresApi.createGasto).mock.calls;
      expect(calls.map((call) => call[0].numeroDocumento)).toEqual(['6033950205', '6033949908']);
      expect(calls.map((call) => call[0].montoTotal)).toEqual([24015, 421821]);
      expect(calls.every((call) => call[0].comentarioTipoDocumento === 'TRANSFERENCIA')).toBe(true);
      // El PDF es el mismo objeto File en las dos filas.
      expect(calls.every((call) => call[0].archivosAdjuntos?.[0].file === archivo)).toBe(true);
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
