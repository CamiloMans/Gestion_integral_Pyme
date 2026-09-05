import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import Horas from './Horas';
import { postgresApi } from '@/services/postgresApi';
import { useAppAuth } from '@/hooks/useAppAuth';
import { PERMISSIONS } from '@/lib/access-control';

vi.mock('@/components/Layout', () => ({ Layout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/hooks/useAppAuth', () => ({ useAppAuth: vi.fn() }));
vi.mock('@/services/postgresApi', async () => {
  const actual = await vi.importActual<typeof import('@/services/postgresApi')>('@/services/postgresApi');
  return {
    ...actual,
    postgresApi: {
      ...actual.postgresApi,
      getHoras: vi.fn(),
      getHorasDashboard: vi.fn(),
    },
  };
});

describe('Horas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAppAuth).mockReturnValue({
      session: { role: 'member', permissions: [PERMISSIONS.HOURS_PERSONAL] },
    } as ReturnType<typeof useAppAuth>);
  });

  it('orienta al trabajador cuando no hay proyectos ni registros', async () => {
    vi.mocked(postgresApi.getHoras).mockResolvedValue({
      range: { from: '2026-08-01', to: '2026-08-31' },
      projects: [],
      entries: [],
    });
    render(<MemoryRouter initialEntries={['/horas/carga']}><Horas /></MemoryRouter>);

    expect(await screen.findByText('No hay proyectos habilitados')).toBeInTheDocument();
    expect(screen.getByText('Aún no tienes horas en este período')).toBeInTheDocument();
  });

  it.each([
    ['una fecha calendario', '2026-09-04'],
    ['un timestamp UTC del servidor', '2026-09-04T00:00:00.000Z'],
  ])('muestra el día correcto cuando el servidor manda %s', async (_caso, fecha) => {
    vi.mocked(postgresApi.getHoras).mockResolvedValue({
      range: { from: '2026-09-01', to: '2026-09-30' },
      projects: [{ id: 'p1', nombre: 'Proyecto solar norte', codigoProyecto: 'PS-01' }],
      entries: [{
        id: 'e1',
        proyectoId: 'p1',
        proyectoNombre: 'Proyecto solar norte',
        userId: 'u1',
        userNombre: 'Camilo',
        userEmail: 'lab@myma.cl',
        fecha,
        horas: 4,
      }],
    });
    render(<MemoryRouter initialEntries={['/horas/carga']}><Horas /></MemoryRouter>);

    // La fecha se renderiza dos veces: tabla de escritorio y tarjetas móviles.
    expect(await screen.findAllByText(/vie 4 de sep/i)).not.toHaveLength(0);
    expect(screen.queryAllByText(/jue 3 de sep/i)).toHaveLength(0);
  });

  it('redirige a un miembro fuera del dashboard consolidado', async () => {
    render(
      <MemoryRouter initialEntries={['/horas/dashboard']}>
        <Routes>
          <Route path="/horas/dashboard" element={<Horas />} />
          <Route path="/horas/carga" element={<div>Carga personal</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Carga personal')).toBeInTheDocument();
    expect(postgresApi.getHorasDashboard).not.toHaveBeenCalled();
  });

  it('permite a un administrador ver el dashboard vacío y sus filtros', async () => {
    vi.mocked(useAppAuth).mockReturnValue({
      session: { role: 'member', permissions: [PERMISSIONS.HOURS_DASHBOARD] },
    } as ReturnType<typeof useAppAuth>);
    vi.mocked(postgresApi.getHorasDashboard).mockResolvedValue({
      filters: { from: '2026-08-01', to: '2026-08-31', proyectoId: 'all', userId: 'all' },
      projects: [],
      users: [],
      entries: [],
      summary: { totalHours: 0, people: 0, projects: 0, records: 0 },
    });
    render(<MemoryRouter initialEntries={['/horas/dashboard']}><Horas /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Dashboard de horas' })).toBeInTheDocument();
    await waitFor(() => expect(postgresApi.getHorasDashboard).toHaveBeenCalled());
    expect(screen.getAllByText('No hay datos para graficar.')).toHaveLength(2);
    expect(screen.getByText('Todos los proyectos')).toBeInTheDocument();
  });
});
