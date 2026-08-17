import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HoraEntryDialog, validateHourAmount } from './HoraEntryDialog';

const project = {
  id: '11111111-1111-4111-8111-111111111111',
  nombre: 'Proyecto solar norte',
  codigoProyecto: 'PS-01',
};

describe('HoraEntryDialog', () => {
  it('valida incrementos de cuarto de hora', () => {
    expect(validateHourAmount(1.25)).toBeNull();
    expect(validateHourAmount(1.2)).toContain('0,25');
    expect(validateHourAmount(25)).toContain('menor o igual a 24');
  });

  it('guarda un registro individual válido', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <HoraEntryDialog
        open
        onOpenChange={vi.fn()}
        projects={[project]}
        entries={[]}
        today="2026-08-16"
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText('Horas'), { target: { value: '2.25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horas' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      proyectoId: project.id,
      fecha: '2026-08-16',
      horas: 2.25,
      detalle: null,
    }));
  });

  it('bloquea una carga que completa más de 24 horas diarias', async () => {
    const onSave = vi.fn();
    render(
      <HoraEntryDialog
        open
        onOpenChange={vi.fn()}
        projects={[project]}
        entries={[{
          id: 'entry-1',
          proyectoId: project.id,
          proyectoNombre: project.nombre,
          userId: 'user-1',
          userNombre: 'Camilo',
          userEmail: 'camilo@example.com',
          fecha: '2026-08-16',
          horas: 23,
        }]}
        today="2026-08-16"
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText('Horas'), { target: { value: '1.25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horas' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('supera 24 horas');
    expect(onSave).not.toHaveBeenCalled();
  });
});

