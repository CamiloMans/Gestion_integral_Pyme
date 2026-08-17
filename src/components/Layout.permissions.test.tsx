import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from './Layout';
import { useAppAuth } from '@/hooks/useAppAuth';
import { PERMISSIONS } from '@/lib/access-control';

vi.mock('@/hooks/useAppAuth', () => ({ useAppAuth: vi.fn() }));
vi.mock('@/components/AppSessionMenu', () => ({ AppSessionMenu: () => <div>Sesión</div> }));

describe('Layout con permisos individuales', () => {
  beforeEach(() => vi.clearAllMocks());

  it('muestra solo módulos y submódulos concedidos', () => {
    vi.mocked(useAppAuth).mockReturnValue({
      session: {
        role: 'member',
        permissions: [PERMISSIONS.EXPENSES_RECORDS, PERMISSIONS.HOURS_DASHBOARD],
      },
    } as ReturnType<typeof useAppAuth>);

    render(<MemoryRouter initialEntries={['/gastos']}><Layout><div>Contenido</div></Layout></MemoryRouter>);

    expect(screen.getByText('Gestion de Gastos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gastos' })).toBeInTheDocument();
    expect(screen.queryByText('Control de Proyectos')).not.toBeInTheDocument();
    expect(screen.queryByText('Control de Asistencia')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Control de Horas'));
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/horas/dashboard');
    expect(screen.queryByText('Cargar horas')).not.toBeInTheDocument();
  });

  it('mantiene solo la sesión cuando no hay módulos', () => {
    vi.mocked(useAppAuth).mockReturnValue({
      session: { role: 'member', permissions: [] },
    } as ReturnType<typeof useAppAuth>);

    render(<MemoryRouter initialEntries={['/sin-acceso']}><Layout><div>Sin acceso</div></Layout></MemoryRouter>);
    expect(screen.getByText('Sesión')).toBeInTheDocument();
    expect(screen.queryByText('Gestion de Gastos')).not.toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });
});
