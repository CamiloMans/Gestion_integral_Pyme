import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GastoModal } from './GastoModal';
import { postgresApi } from '@/services/postgresApi';
import { toast } from '@/hooks/use-toast';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

vi.mock('./DocumentoViewer', () => ({
  DocumentoViewer: ({ open, archivo }: { open: boolean; archivo?: { nombre: string } }) =>
    open ? <div data-testid="documento-viewer">{archivo?.nombre}</div> : null,
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/services/postgresApi', () => ({
  postgresApi: {
    extractGastoDocument: vi.fn(),
  },
}));

const props = {
  open: true,
  onClose: vi.fn(),
  onSave: vi.fn(),
  proyectos: [],
  empresas: [{ id: 'empresa-1', razonSocial: 'Proveedor Uno SPA', rut: '76.123.456-7', createdAt: '2026-01-01' }],
  categorias: [{ id: 'categoria-1', nombre: 'Materiales' }],
  tiposDocumento: [{ id: 'tipo-1', nombre: 'BOLETA', tieneImpuestos: false, valorImpuestos: 0 }],
  onCreateProyecto: vi.fn(),
  onCreateEmpresa: vi.fn(),
  onCreateCategoria: vi.fn(),
};

describe('GastoModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('keeps extracted fields when opening an attached file preview', async () => {
    vi.mocked(postgresApi.extractGastoDocument).mockResolvedValue({
      fecha: '2026-05-29',
      tipoDocumento: 'BOLETA',
      numeroDocumento: '278678',
      empresaNombre: 'Proveedor Uno SPA',
      empresaRut: '76.123.456-7',
      emisorNombre: null,
      emisorRut: null,
      receptorNombre: null,
      receptorRut: null,
      montoNeto: null,
      iva: null,
      montoTotal: 2500,
      detalle: 'Servicio de comidas en restaurante',
      confidence: 0.95,
      warnings: [],
    });

    render(<GastoModal {...props} />);
    const input = document.querySelector('#archivosAdjuntos') as HTMLInputElement;
    const file = new File(['pdf'], 'CamScanner 29-05-26 16.53-1.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByDisplayValue('278678')).toBeInTheDocument());
    expect(screen.getByLabelText('Monto Total (CLP) *')).toHaveValue('2.500');
    expect(screen.getByDisplayValue('SERVICIO DE COMIDAS EN RESTAURANTE')).toBeInTheDocument();

    fireEvent.click(screen.getByText('CamScanner 29-05-26 16.53-1.pdf'));

    expect(screen.getByTestId('documento-viewer')).toHaveTextContent('CamScanner 29-05-26 16.53-1.pdf');
    expect(screen.getByDisplayValue('278678')).toBeInTheDocument();
    expect(screen.getByLabelText('Monto Total (CLP) *')).toHaveValue('2.500');
    expect(screen.getByDisplayValue('SERVICIO DE COMIDAS EN RESTAURANTE')).toBeInTheDocument();
  });

  it('sends the specified document type when the option name is uppercase OTRO', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <GastoModal
        {...props}
        onSave={onSave}
        tiposDocumento={[{ id: 'tipo-otro', nombre: 'OTRO', tieneImpuestos: false, valorImpuestos: 0 }]}
        gasto={{
          id: 'gasto-1',
          fecha: '2026-06-05',
          categoria: 'categoria-1',
          tipoDocumento: 'tipo-otro',
          numeroDocumento: '0506000000000000',
          empresaId: 'empresa-1',
          monto: 14110,
          montoTotal: 14110,
          detalle: '',
          comentarioTipoDocumento: 'TRANSFERENCIA',
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Especificar tipo de documento *')).toHaveValue('TRANSFERENCIA');
    });

    const form = screen.getByRole('button', { name: /guardar/i }).closest('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      comentarioTipoDocumento: 'TRANSFERENCIA',
      tipoDocumento: 'tipo-otro',
      numeroDocumento: '0506000000000000',
      montoTotal: 14110,
    }));
  });

  describe('modo compromiso', () => {
    const gastoCompromiso = {
      id: 'gasto-compromiso-1',
      fecha: '2026-09-01',
      categoria: 'categoria-1',
      tipoDocumento: 'tipo-1',
      numeroDocumento: 'DOC-100',
      empresaId: 'empresa-1',
      monto: 50000,
      montoTotal: 50000,
      fechaCompromiso: '2026-10-15',
      fechaPago: '2026-10-20',
      facturado: true,
      pagado: false,
    };

    it('renders compromiso fields with facturado checked and pagado unchecked by default', () => {
      render(<GastoModal {...props} mode="compromiso" />);

      expect(screen.getByLabelText('Fecha Compromiso *')).toBeInTheDocument();
      expect(screen.getByLabelText('Fecha Pago *')).toBeInTheDocument();
      expect(screen.queryByLabelText('Fecha *')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Tipo de Documento')).toBeInTheDocument();
      expect(screen.getByLabelText('Numero de Documento')).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '30 dias' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '60 dias' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '90 dias' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Facturado' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('checkbox', { name: 'Pagado' })).toHaveAttribute('aria-checked', 'false');
    });

    it('does not call document extraction when attaching a file', async () => {
      render(<GastoModal {...props} mode="compromiso" />);

      const input = document.querySelector('#archivosAdjuntos') as HTMLInputElement;
      const file = new File(['pdf'], 'factura-futura.pdf', { type: 'application/pdf' });

      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => expect(screen.getByText('factura-futura.pdf')).toBeInTheDocument());
      expect(postgresApi.extractGastoDocument).not.toHaveBeenCalled();
    });

    it('includes compromiso fields in onSave payload', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);

      render(<GastoModal {...props} onSave={onSave} mode="compromiso" gasto={gastoCompromiso} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Fecha Compromiso *')).toHaveValue('2026-10-15');
      });

      const form = screen.getByRole('button', { name: /guardar/i }).closest('form') as HTMLFormElement;
      fireEvent.submit(form);

      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        fecha: '2026-10-15',
        fechaCompromiso: '2026-10-15',
        fechaPago: '2026-10-20',
        facturado: true,
        pagado: false,
        montoTotal: 50000,
      }));
    });

    it('resolves the SIN DOCUMENTO type when tipo and numero are empty', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);

      render(
        <GastoModal
          {...props}
          onSave={onSave}
          mode="compromiso"
          tiposDocumento={[...props.tiposDocumento, { id: 'tipo-sin-doc', nombre: 'Sin Documento' }]}
          gasto={{ ...gastoCompromiso, tipoDocumento: '', numeroDocumento: '' }}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Fecha Compromiso *')).toHaveValue('2026-10-15');
      });

      const form = screen.getByRole('button', { name: /guardar/i }).closest('form') as HTMLFormElement;
      fireEvent.submit(form);

      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        tipoDocumento: 'tipo-sin-doc',
        numeroDocumento: '',
      }));
    });

    it('shows a validation error when tipo is empty and SIN DOCUMENTO does not exist', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);

      render(
        <GastoModal
          {...props}
          onSave={onSave}
          mode="compromiso"
          gasto={{ ...gastoCompromiso, tipoDocumento: '' }}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Fecha Compromiso *')).toHaveValue('2026-10-15');
      });

      const form = screen.getByRole('button', { name: /guardar/i }).closest('form') as HTMLFormElement;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Campos obligatorios',
          description: expect.stringContaining('Tipo de documento'),
        }));
      });
      expect(onSave).not.toHaveBeenCalled();
    });

    it('shows a validation error when fecha pago is empty', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);

      render(
        <GastoModal
          {...props}
          onSave={onSave}
          mode="compromiso"
          gasto={{ ...gastoCompromiso, fechaPago: undefined }}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Fecha Compromiso *')).toHaveValue('2026-10-15');
      });

      const form = screen.getByRole('button', { name: /guardar/i }).closest('form') as HTMLFormElement;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Campos obligatorios',
          description: expect.stringContaining('Fecha pago'),
        }));
      });
      expect(onSave).not.toHaveBeenCalled();
    });

    it('computes fecha pago from the selected payment term', async () => {
      render(<GastoModal {...props} mode="compromiso" />);

      fireEvent.change(screen.getByLabelText('Fecha Compromiso *'), { target: { value: '2026-10-15' } });
      fireEvent.click(screen.getByRole('radio', { name: '30 dias' }));

      expect(screen.getByLabelText('Fecha Pago *')).toHaveValue('2026-11-14');

      fireEvent.change(screen.getByLabelText('Fecha Compromiso *'), { target: { value: '2026-10-20' } });
      expect(screen.getByLabelText('Fecha Pago *')).toHaveValue('2026-11-19');

      fireEvent.change(screen.getByLabelText('Fecha Pago *'), { target: { value: '2026-12-01' } });
      expect(screen.getByRole('radio', { name: '30 dias' })).toHaveAttribute('aria-checked', 'false');
    });

    it('asks for invoice confirmation when pagado is checked without facturado', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);

      render(
        <GastoModal
          {...props}
          onSave={onSave}
          mode="compromiso"
          gasto={{ ...gastoCompromiso, facturado: false, pagado: true, fechaPago: '2026-10-20' }}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: 'Pagado' })).toHaveAttribute('aria-checked', 'true');
      });

      const form = screen.getByRole('button', { name: /guardar/i }).closest('form') as HTMLFormElement;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Confirmar estado de facturacion')).toBeInTheDocument();
      });
      expect(onSave).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Si, fue facturado' }));

      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        facturado: true,
        pagado: true,
        fechaPago: '2026-10-20',
      }));
    });
  });
});
