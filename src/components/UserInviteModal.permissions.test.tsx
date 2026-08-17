import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UserInviteModal } from './UserInviteModal';
import { useAppAuth } from '@/hooks/useAppAuth';
import { PERMISSIONS } from '@/lib/access-control';

vi.mock('@/hooks/useAppAuth', () => ({ useAppAuth: vi.fn() }));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

describe('UserInviteModal permisos', () => {
  it('parte sin accesos y permite seleccionar un módulo completo', async () => {
    vi.mocked(useAppAuth).mockReturnValue({
      session: { role: 'super_admin', permissions: [] },
    } as ReturnType<typeof useAppAuth>);
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(<UserInviteModal open onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Correo de acceso *'), { target: { value: 'nuevo@rekosol.cl' } });
    fireEvent.click(screen.getByText('Dashboard', { selector: 'label' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar invitacion' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      email: 'nuevo@rekosol.cl',
      permissions: [PERMISSIONS.REPORTS_DASHBOARD],
    })));
  });
});
