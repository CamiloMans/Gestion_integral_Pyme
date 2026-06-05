import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GastoModal } from './GastoModal';
import { postgresApi } from '@/services/postgresApi';

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
});
