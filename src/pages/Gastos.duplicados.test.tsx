import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Gastos from './Gastos';
import { ApiError, postgresApi } from '@/services/postgresApi';
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
vi.mock('@/components/DetalleGastoDialog', () => ({ DetalleGastoDialog: () => <div /> }));

// El modal real no aporta a estas pruebas: basta con poder disparar onSave.
vi.mock('@/components/GastoModal', () => ({
  GastoModal: ({ open, onSave }: { open: boolean; onSave: (gasto: Omit<Gasto, 'id'>) => void }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onSave({
            fecha: '2026-10-28',
            empresaId: 'empresa-1',
            categoria: 'categoria-1',
            tipoDocumento: 'tipo-1',
            numeroDocumento: '150554944',
            monto: 39364,
            montoTotal: 39364,
          } as Omit<Gasto, 'id'>)
        }
      >
        guardar-gasto-test
      </button>
    ) : null,
}));

// ConfirmDialog real usa AlertDialog de Radix; aqui solo interesan las acciones.
vi.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    description,
    onConfirm,
  }: {
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <div>
        <p>{title}</p>
        <p>{description}</p>
        <button type="button" onClick={onConfirm}>{`confirmar: ${title}`}</button>
      </div>
    ) : null,
}));

vi.mock('@/services/postgresApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/postgresApi')>();

  return {
    ...actual,
    postgresApi: {
      getBootstrap: vi.fn(),
      getGastos: vi.fn(),
      createGasto: vi.fn(),
      updateGasto: vi.fn(),
      deleteGasto: vi.fn(),
      createProyecto: vi.fn(),
      createCategoria: vi.fn(),
      createEmpresa: vi.fn(),
    },
  };
});

const bootstrap = {
  tenant: { id: 'tenant-1', slug: 'rekosol', nombre: 'Rekosol' },
  empresas: [{ id: 'empresa-1', razonSocial: 'SODIMAC', rut: '96.792.430-K', createdAt: '2026-01-01' }],
  proyectos: [{ id: 'proyecto-1', nombre: 'CON-PR20', createdAt: '2026-01-01' }],
  categorias: [{ id: 'categoria-1', nombre: 'MATERIALES', color: 'bg-blue-500' }],
  tiposDocumento: [{ id: 'tipo-1', nombre: 'FACTURA', tieneImpuestos: true, valorImpuestos: 0.19 }],
  colaboradores: [],
};

const errorDuplicado = () =>
  new ApiError('Ya existe un gasto con la misma empresa, numero de documento, fecha y monto.', 409, {
    codigo: 'GASTO_DUPLICADO',
    duplicados: [
      {
        id: 'gasto-existente',
        fecha: '2026-10-28',
        numeroDocumento: '150554944',
        montoTotal: 39364,
        detalle: null,
        createdAt: '2026-10-29T21:06:48.780Z',
        creadoPorNombre: 'Gerardo Soto',
      },
    ],
  });

const abrirYGuardar = async () => {
  render(<MemoryRouter initialEntries={['/gastos']}><Gastos /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /nuevo gasto/i }));
  fireEvent.click(screen.getByRole('button', { name: 'guardar-gasto-test' }));
};

describe('Gastos: prevencion de duplicados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(postgresApi.getBootstrap).mockResolvedValue(bootstrap as never);
    vi.mocked(postgresApi.getGastos).mockResolvedValue([]);
  });

  it('manda un intentoId en el alta', async () => {
    vi.mocked(postgresApi.createGasto).mockResolvedValue({ id: 'gasto-nuevo' } as never);
    await abrirYGuardar();

    await waitFor(() => expect(postgresApi.createGasto).toHaveBeenCalledTimes(1));
    const control = vi.mocked(postgresApi.createGasto).mock.calls[0][1];
    expect(control?.intentoId).toMatch(/^[0-9a-f-]{36}$/);
    expect(control?.permitirDuplicado).toBe(false);
  });

  it('avisa en vez de guardar cuando el gasto ya existe', async () => {
    vi.mocked(postgresApi.createGasto).mockRejectedValue(errorDuplicado());
    await abrirYGuardar();

    expect(await screen.findByText('Ya existe un gasto igual')).toBeInTheDocument();
    expect(screen.getByText(/Gerardo Soto/)).toBeInTheDocument();
    expect(postgresApi.createGasto).toHaveBeenCalledTimes(1);
  });

  it('reintenta con permitirDuplicado y el mismo intentoId al confirmar', async () => {
    vi.mocked(postgresApi.createGasto)
      .mockRejectedValueOnce(errorDuplicado())
      .mockResolvedValueOnce({ id: 'gasto-nuevo' } as never);
    await abrirYGuardar();

    fireEvent.click(await screen.findByRole('button', { name: 'confirmar: Ya existe un gasto igual' }));

    await waitFor(() => expect(postgresApi.createGasto).toHaveBeenCalledTimes(2));
    const primero = vi.mocked(postgresApi.createGasto).mock.calls[0][1];
    const segundo = vi.mocked(postgresApi.createGasto).mock.calls[1][1];

    expect(segundo?.permitirDuplicado).toBe(true);
    expect(segundo?.intentoId).toBe(primero?.intentoId);
  });
});
